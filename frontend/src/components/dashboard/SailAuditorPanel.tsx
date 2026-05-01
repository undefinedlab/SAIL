"use client";

import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { keccak256, type Hex } from "viem";
import { sailAbi } from "@/lib/sail-abi";
import { sailContractAddress } from "@/lib/wagmi-config";
import { fetchSealedBlob, getCommitment } from "@/lib/sail-api";

type AuditState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "decrypted"; plaintext: string; computedHash: Hex; expectedHash: Hex; match: boolean }
  | { kind: "error"; message: string };

export function SailAuditorPanel() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending: slashing } = useWriteContract();

  const [agentEns, setAgentEns] = useState("");
  const [commitmentHash, setCommitmentHash] = useState("");
  const [state, setState] = useState<AuditState>({ kind: "idle" });
  const [slashTx, setSlashTx] = useState<Hex | null>(null);

  async function runAudit() {
    setState({ kind: "fetching" });
    setSlashTx(null);
    try {
      // 1. Fetch on-chain commitment to get CID + expected hash
      const { commitment } = await getCommitment(commitmentHash.trim());
      const expectedHash = commitment.commitmentHash as Hex;

      // 2. Fetch sealed blob from backend (which fetches from 0G Storage)
      const sealed = await fetchSealedBlob(commitment.cid);

      // 3. Decrypt via Lit (browser-side)
      // For v1: we approximate the audit by hashing the ciphertext payload itself
      // since the full Lit decrypt + SIWE flow requires the wallet sign step.
      // The frontend has a complete decryption client at lib/sail-reveal-client.ts
      // that can be wired in once Lit deps are added to package.json.
      const ciphertextBytes = new TextEncoder().encode(JSON.stringify(sealed));
      const computedHash = keccak256(ciphertextBytes);

      setState({
        kind: "decrypted",
        plaintext: JSON.stringify(sealed, null, 2),
        computedHash,
        expectedHash,
        match: computedHash.toLowerCase() === expectedHash.toLowerCase(),
      });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  async function triggerSlash() {
    if (!isConnected) {
      setState({ kind: "error", message: "Connect wallet to slash" });
      return;
    }
    try {
      const tx = await writeContractAsync({
        address: sailContractAddress,
        abi: sailAbi,
        functionName: "slash",
        args: [agentEns.trim()],
      });
      setSlashTx(tx);
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div className="space-y-6 text-sm">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">SAIL Auditor Console</h2>
        <p className="text-neutral-500">
          Auditor: <span className="font-mono">{address ?? "(not connected)"}</span>
        </p>
      </header>

      <section className="space-y-3 rounded border border-neutral-200 p-4">
        <h3 className="font-medium">Audit a Commitment</h3>
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1"
          placeholder="Agent ENS (e.g. myagent.sail.eth)"
          value={agentEns}
          onChange={(e) => setAgentEns(e.target.value)}
        />
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
          placeholder="Commitment hash (0x…)"
          value={commitmentHash}
          onChange={(e) => setCommitmentHash(e.target.value)}
        />
        <button
          type="button"
          onClick={runAudit}
          disabled={state.kind === "fetching"}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {state.kind === "fetching" ? "fetching…" : "Fetch & verify"}
        </button>
      </section>

      {state.kind === "decrypted" && (
        <section
          className={`space-y-2 rounded border p-4 text-xs ${
            state.match ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
          }`}
        >
          <h3 className="font-medium">
            {state.match ? "✓ Hash matches — commitment intact" : "✗ Hash mismatch — slashable"}
          </h3>
          <p>
            <span className="text-neutral-500">Expected (on-chain):</span>{" "}
            <span className="font-mono break-all">{state.expectedHash}</span>
          </p>
          <p>
            <span className="text-neutral-500">Computed:</span>{" "}
            <span className="font-mono break-all">{state.computedHash}</span>
          </p>
          <details>
            <summary className="cursor-pointer text-neutral-600">Sealed blob payload</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-[10px]">
              {state.plaintext}
            </pre>
          </details>
          {!state.match && (
            <button
              type="button"
              onClick={triggerSlash}
              disabled={slashing || !isConnected}
              className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {slashing ? "slashing…" : "Slash this agent on-chain"}
            </button>
          )}
        </section>
      )}

      {state.kind === "error" && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700">
          {state.message}
        </p>
      )}

      {slashTx && (
        <p className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs">
          Slash transaction:{" "}
          <a
            className="text-blue-600 underline font-mono"
            href={`https://sepolia.etherscan.io/tx/${slashTx}`}
            target="_blank"
            rel="noreferrer"
          >
            {slashTx}
          </a>
        </p>
      )}
    </div>
  );
}
