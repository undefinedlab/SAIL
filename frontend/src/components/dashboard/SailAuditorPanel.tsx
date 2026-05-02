"use client";

import { useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ConnectButtonNoSSR } from "@/components/wallet/ConnectButtonNoSSR";
import { keccak256, type Hex } from "viem";
import { sailAbi } from "@/lib/sail-abi";
import { fetchSealedBlob, getCommitment, getAgent } from "@/lib/sail-api";
import { useBackendStatus } from "@/lib/hooks/useBackendStatus";
import { expectedChain, sailContractAddress } from "@/lib/wagmi-config";
import { StatusDot } from "@/components/ui/StatusDot";
import { TxLink } from "@/components/ui/TxLink";

type Tab = "lookup" | "audit" | "slash";

type CommitmentInfo = {
  inputHash: string;
  commitmentHash: string;
  cid: string;
  nonce: string;
  timestamp: string;
  executed: boolean;
};

type AuditResult = {
  expectedHash: string;
  wireHash: string;
  sealedPayload: string;
  note: string;
};

export function SailAuditorPanel() {
  const { address, isConnected, chain } = useAccount();
  const backend = useBackendStatus();

  const [tab, setTab] = useState<Tab>("lookup");

  const [lookupEns, setLookupEns] = useState("");
  const [lookupHash, setLookupHash] = useState("");
  const [commitment, setCommitment] = useState<CommitmentInfo | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [auditCid, setAuditCid] = useState("");
  const [auditExpectedHash, setAuditExpectedHash] = useState("");
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [slashEns, setSlashEns] = useState("");
  const {
    writeContract,
    data: slashTxHash,
    isPending: slashPending,
    error: slashError,
  } = useWriteContract();
  const { isSuccess: slashConfirmed, isLoading: slashConfirming } =
    useWaitForTransactionReceipt({ hash: slashTxHash });

  async function handleLookup() {
    setLookupBusy(true);
    setLookupError(null);
    setCommitment(null);

    try {
      if (lookupHash.trim()) {
        const result = await getCommitment(lookupHash.trim());
        setCommitment(result.commitment);
        setAuditCid(result.commitment.cid);
        setAuditExpectedHash(result.commitment.commitmentHash);
      } else if (lookupEns.trim()) {
        const result = await getAgent(lookupEns.trim());
        setLookupError(
          result.agent.active
            ? `Agent active — ${result.agent.commitmentCount} commitment(s) on record. Enter a commitment hash to inspect a specific audit anchor.`
            : "Agent is inactive or has already been slashed.",
        );
        setSlashEns(lookupEns.trim());
      } else {
        throw new Error("Enter a commitment hash or agent ENS name");
      }
    } catch (error) {
      setLookupError((error as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }

  function useForAudit() {
    if (!commitment) {
      return;
    }

    setAuditCid(commitment.cid);
    setAuditExpectedHash(commitment.commitmentHash);
    setTab("audit");
  }

  async function handleAudit() {
    setAuditBusy(true);
    setAuditError(null);
    setAuditResult(null);

    try {
      if (!auditCid.trim()) throw new Error("0G Storage root hash required");
      if (!auditExpectedHash.trim()) throw new Error("Expected commitment hash required");

      const sealed = await fetchSealedBlob(auditCid.trim());
      const wireBytes = new TextEncoder().encode(JSON.stringify(sealed));
      const wireHash = keccak256(wireBytes) as Hex;

      setAuditResult({
        expectedHash: auditExpectedHash,
        wireHash,
        sealedPayload: JSON.stringify(sealed, null, 2),
        note:
          "The on-chain commitment hash anchors the plaintext commitment blob. This console confirms retrieval of the sealed Lit payload and fingerprints the encrypted wire payload, but plaintext equality still needs the wallet-backed Lit decrypt step.",
      });
    } catch (error) {
      setAuditError((error as Error).message);
    } finally {
      setAuditBusy(false);
    }
  }

  function handleSlash() {
    if (!slashEns.trim()) {
      return;
    }

    writeContract({
      address: sailContractAddress,
      abi: sailAbi,
      functionName: "slash",
      args: [slashEns.trim()],
      chainId: expectedChain.id,
    });
  }

  const chainMismatch = isConnected && chain?.id !== expectedChain.id;

  const tabCls = (value: Tab) =>
    `px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
      tab === value
        ? "border-red-600 text-red-600"
        : "border-transparent text-neutral-500 hover:text-neutral-800"
    }`;

  return (
    <div className="space-y-0 text-sm">
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-bold text-[#05058a]">Auditor Console</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-3">
              <p className="text-xs text-neutral-500">
                Backend{" "}
                <StatusDot
                  status={backend.status}
                  label={
                    backend.status === "online"
                      ? "online"
                      : backend.status === "offline"
                        ? "offline"
                        : "checking…"
                  }
                />
              </p>
              {address ? (
                <p className="font-mono text-xs text-neutral-400">
                  {address.slice(0, 8)}…{address.slice(-4)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500">
            <span className="border border-neutral-200 px-2 py-1">
              Expected chain: {expectedChain.name}
            </span>
            {backend.contract ? (
              <span className="border border-neutral-200 px-2 py-1">
                Contract: {backend.contract.slice(0, 10)}…{backend.contract.slice(-6)}
              </span>
            ) : null}
          </div>
          {chainMismatch ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Wallet is connected to {chain?.name ?? "another chain"}. Switch to {expectedChain.name} before any slash transaction.
            </p>
          ) : null}
        </div>
        <ConnectButtonNoSSR showBalance={false} chainStatus="icon" />
      </div>

      <div className="flex border-b border-neutral-200">
        <button className={tabCls("lookup")} onClick={() => setTab("lookup")}>Lookup</button>
        <button className={tabCls("audit")} onClick={() => setTab("audit")}>Audit</button>
        <button className={tabCls("slash")} onClick={() => setTab("slash")}>Slash</button>
      </div>

      <div className="pt-5">
        {tab === "lookup" && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Inspect an agent or a specific commitment anchor before moving into the audit flow.
            </p>
            <div className="space-y-2">
              <input
                className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                placeholder="Commitment hash 0x…"
                value={lookupHash}
                onChange={(event) => setLookupHash(event.target.value)}
              />
              <p className="text-center text-[10px] text-neutral-400">or</p>
              <input
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="Agent ENS myagent.sail.eth"
                value={lookupEns}
                onChange={(event) => setLookupEns(event.target.value)}
              />
            </div>
            <button
              onClick={handleLookup}
              disabled={lookupBusy || backend.status !== "online"}
              className="rounded bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
            >
              {lookupBusy ? "Looking up…" : "Lookup"}
            </button>

            {lookupError ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {lookupError}
              </p>
            ) : null}

            {commitment ? (
              <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-4 text-xs">
                <p className="font-medium">Commitment found</p>
                <dl className="space-y-1">
                  <div>
                    <dt className="text-neutral-400">Hash</dt>
                    <dd className="break-all font-mono">{commitment.commitmentHash}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Input hash</dt>
                    <dd className="break-all font-mono">{commitment.inputHash}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">0G root hash</dt>
                    <dd className="break-all font-mono">{commitment.cid}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Nonce</dt>
                    <dd>{commitment.nonce}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Executed</dt>
                    <dd>{commitment.executed ? "yes" : "no"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Timestamp</dt>
                    <dd>{new Date(Number(commitment.timestamp) * 1000).toLocaleString()}</dd>
                  </div>
                </dl>
                <button
                  onClick={useForAudit}
                  className="mt-2 rounded border border-[#05058a] px-3 py-1 text-xs text-[#05058a] hover:bg-[#05058a]/5"
                >
                  Audit this commitment →
                </button>
              </div>
            ) : null}
          </div>
        )}

        {tab === "audit" && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Fetch the sealed Lit payload from 0G Storage and fingerprint the retrieved wire payload before any deeper reveal step.
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">0G root hash</label>
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                  placeholder="0x…"
                  value={auditCid}
                  onChange={(event) => setAuditCid(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">
                  Expected commitment hash (plaintext anchor)
                </label>
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                  placeholder="0x…"
                  value={auditExpectedHash}
                  onChange={(event) => setAuditExpectedHash(event.target.value)}
                />
              </div>
            </div>
            <button
              onClick={handleAudit}
              disabled={auditBusy || backend.status !== "online"}
              className="rounded bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
            >
              {auditBusy ? "Fetching blob…" : "Fetch sealed payload"}
            </button>

            {auditError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {auditError}
              </p>
            ) : null}

            {auditResult ? (
              <div className="space-y-3 rounded border border-emerald-200 bg-emerald-50 p-4 text-xs">
                <p className="font-semibold text-emerald-800">
                  ✓ Sealed payload retrieved from 0G Storage
                </p>
                <p className="leading-relaxed text-emerald-900/80">{auditResult.note}</p>
                <div className="space-y-1">
                  <p>
                    <span className="text-neutral-500">On-chain commitment hash:</span>{" "}
                    <span className="break-all font-mono">{auditResult.expectedHash}</span>
                  </p>
                  <p>
                    <span className="text-neutral-500">Encrypted wire hash:</span>{" "}
                    <span className="break-all font-mono">{auditResult.wireHash}</span>
                  </p>
                </div>
                <details>
                  <summary className="cursor-pointer text-neutral-600 hover:text-neutral-800">
                    Sealed blob payload
                  </summary>
                  <pre className="mt-2 max-h-52 overflow-auto rounded border border-neutral-200 bg-white p-2 text-[10px]">
                    {auditResult.sealedPayload}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        )}

        {tab === "slash" && (
          <div className="space-y-4">
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              <p className="font-semibold">Irreversible action</p>
              <p className="mt-1">
                Slashing permanently deactivates an agent and transfers their stake to the auditor wallet. Only use this after you have independently completed a valid reveal and mismatch verification flow.
              </p>
            </div>

            {!isConnected ? (
              <p className="text-xs text-neutral-500">Connect your wallet to slash.</p>
            ) : null}

            <div>
              <label className="mb-1 block text-xs text-neutral-500">Agent ENS to slash</label>
              <input
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="misbehaving-agent.sail.eth"
                value={slashEns}
                onChange={(event) => setSlashEns(event.target.value)}
              />
            </div>
            <button
              onClick={handleSlash}
              disabled={!isConnected || slashPending || slashConfirming || !slashEns.trim()}
              className="rounded bg-red-600 px-5 py-2 text-sm text-white disabled:opacity-40 hover:bg-red-700"
            >
              {slashPending
                ? "Confirm in wallet…"
                : slashConfirming
                  ? "Waiting for block…"
                  : "Slash agent on-chain"}
            </button>

            {slashError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {slashError.message}
              </p>
            ) : null}
            {slashTxHash ? (
              <p className="text-xs">
                Tx submitted: <TxLink hash={slashTxHash} />
              </p>
            ) : null}
            {slashConfirmed ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                ✓ Slash confirmed. Agent is permanently deactivated and stake transferred.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
