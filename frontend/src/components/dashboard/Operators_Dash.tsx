"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatEther, isAddress, parseEther } from "viem";
import { computeAgentIdBytes32 } from "@/lib/agent-id";
import { loadOperatorAgent, saveOperatorAgent } from "@/lib/operator-agent";
import { sailAbi } from "@/lib/sail-abi";
import { expectedChain, sailContractAddress } from "@/lib/wagmi-config";

export function Operators_Dash() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync, isPending: isRegistering } = useWriteContract();
  const [tab, setTab] = useState<"register" | "monitor" | "audit">("register");

  const [runtimeHash, setRuntimeHash] = useState("");
  const [stakeEth, setStakeEth] = useState("0.1");
  const [agentProfile, setAgentProfile] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedTxHash, setSubmittedTxHash] = useState<`0x${string}` | null>(null);
  const [localAgent, setLocalAgent] = useState(() => loadOperatorAgent());

  const contractOk = isAddress(sailContractAddress);
  const wrongChain = isConnected && chainId !== expectedChain.id;

  const agentIdBytes32 = useMemo(() => {
    if (!address) return null;
    if (!runtimeHash.trim()) return null;
    return computeAgentIdBytes32(address, runtimeHash);
  }, [address, runtimeHash]);

  const { data: minStakeWei } = useReadContract({
    address: contractOk ? sailContractAddress : undefined,
    abi: sailAbi,
    functionName: "minStake",
    query: { enabled: contractOk },
  });

  const { data: agentOnChain } = useReadContract({
    address: contractOk ? sailContractAddress : undefined,
    abi: sailAbi,
    functionName: "agents",
    args: agentIdBytes32 ? [agentIdBytes32] : undefined,
    query: { enabled: contractOk && !!agentIdBytes32 },
  });

  const { isLoading: txPending, isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: submittedTxHash ?? undefined,
  });

  const canRegister =
    isConnected &&
    !!address &&
    !wrongChain &&
    contractOk &&
    !!agentIdBytes32 &&
    !isRegistering &&
    !txPending;

  async function registerAgent() {
    setSubmitError(null);
    if (!address) {
      setSubmitError("Connect wallet first.");
      return;
    }
    if (wrongChain) {
      setSubmitError(`Switch to ${expectedChain.name}.`);
      return;
    }
    if (!contractOk) {
      setSubmitError("Missing NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS.");
      return;
    }
    if (!runtimeHash.trim()) {
      setSubmitError("Runtime hash is required.");
      return;
    }
    if (!agentIdBytes32) {
      setSubmitError("Could not compute agent id.");
      return;
    }

    let valueWei: bigint;
    try {
      valueWei = parseEther(stakeEth || "0");
    } catch {
      setSubmitError("Invalid stake amount.");
      return;
    }

    try {
      const txHash = await writeContractAsync({
        address: sailContractAddress,
        abi: sailAbi,
        functionName: "registerAgent",
        args: [agentIdBytes32],
        value: valueWei,
      });
      setSubmittedTxHash(txHash);

      const reg = {
        agentIdBytes32,
        runtimeHash: runtimeHash.trim(),
        stakeEth: stakeEth.trim(),
        registerTxHash: txHash,
        agentProfile: agentProfile.trim(),
        registeredAt: Date.now(),
      } as const;
      saveOperatorAgent(reg);
      setLocalAgent(reg);
      setTab("monitor");
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="w-full">
      <div className="border border-[#05058a]/15 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[62rem]">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              Path A — Operator dashboard
            </p>
            <h1 className="mt-3 text-[clamp(34px,4.8vw,62px)] font-black leading-[0.95] tracking-[-0.03em] text-[#05058a]">
              Control room
            </h1>
          </div>

          <div className="w-full md:w-auto md:text-right">
            <div className="md:hidden">
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border border-[#05058a]/15 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "register", label: "Register agent" },
            { id: "monitor", label: "Agent monitor" },
            { id: "audit", label: "Audit box" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-4 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                tab === t.id
                  ? "bg-[#05058a] text-white"
                  : "border border-[#05058a]/20 bg-white text-[#05058a] hover:bg-[#f5f5f0]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "register" && (
        <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Register agent</p>
          <div className="mt-5 grid gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Runtime hash</p>
              <input
                value={runtimeHash}
                onChange={(e) => setRuntimeHash(e.target.value)}
                placeholder="e.g. claude-sonnet-4.1 + flow hash"
                className="mt-2 w-full border border-[#05058a]/30 bg-[#f5f5f0] px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Stake (ETH)</p>
              <input
                value={stakeEth}
                onChange={(e) => setStakeEth(e.target.value)}
                placeholder="0.1"
                className="mt-2 w-full border border-[#05058a]/30 bg-[#f5f5f0] px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
              />
              <p className="mt-2 text-xs text-[#05058a]/65">
                Contract min stake: {typeof minStakeWei === "bigint" ? `${formatEther(minStakeWei)} ETH` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Agent profile (optional)</p>
              <textarea
                value={agentProfile}
                onChange={(e) => setAgentProfile(e.target.value)}
                placeholder="Capabilities, scope, or team note..."
                className="mt-2 min-h-[90px] w-full resize-y border border-[#05058a]/30 bg-[#f5f5f0] px-3 py-2 text-sm text-[#05058a] outline-none focus:border-[#05058a]"
              />
            </div>
          </div>

          <div className="mt-5 border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Computed agent id</p>
            <p className="mt-2 break-all font-mono text-xs text-[#05058a]/80">{agentIdBytes32 ?? "—"}</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void registerAgent()}
              disabled={!canRegister}
              className="bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isRegistering || txPending ? "Registering…" : "Register on-chain"}
            </button>
            {wrongChain ? (
              <p className="text-xs text-amber-900">Switch to {expectedChain.name}</p>
            ) : null}
            {!contractOk ? (
              <p className="text-xs text-amber-900">Set NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS</p>
            ) : null}
          </div>

          {submittedTxHash ? (
            <p className="mt-3 text-xs text-[#05058a]/65">
              Tx hash: <span className="font-mono">{submittedTxHash}</span>
              {txConfirmed ? " (confirmed)" : ""}
            </p>
          ) : null}
          {submitError ? <p className="mt-3 text-sm text-rose-800">{submitError}</p> : null}
        </div>
      )}

      {tab === "monitor" && (
        <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Agent monitor</p>
          {localAgent ? (
            <div className="mt-4 space-y-2 text-sm text-[#05058a]/75">
              <p>
                Local agent id: <span className="font-mono">{localAgent.agentIdBytes32}</span>
              </p>
              <p>
                Runtime hash: <span className="font-mono">{localAgent.runtimeHash}</span>
              </p>
              <p>
                Stake (local): <span className="font-mono">{localAgent.stakeEth} ETH</span>
              </p>
              <p>
                On-chain registered:{" "}
                <span className="font-mono">{agentOnChain ? String(agentOnChain[0]) : "—"}</span>
              </p>
              <p>
                On-chain nonce: <span className="font-mono">{agentOnChain ? String(agentOnChain[1]) : "—"}</span>
              </p>
              <p>
                On-chain stake:{" "}
                <span className="font-mono">
                  {agentOnChain && typeof agentOnChain[2] === "bigint" ? `${formatEther(agentOnChain[2])} ETH` : "—"}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#05058a]/70">
              No local agent saved yet. Use Register agent first.
            </p>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Audit box</p>
          <p className="mt-3 text-sm text-[#05058a]/70">
            Next step: list incoming reveal requests and allow approve/deny actions.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard/auditor"
              className="bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90"
            >
              Open auditor path
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Quick links</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/dashboard/auditor"
            className="bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90"
          >
            Open auditor path
          </Link>
          <Link
            href="/dashboard"
            className="border border-[#05058a]/20 bg-[#f5f5f0] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a] transition-colors hover:bg-white"
          >
            Back to selector
          </Link>
        </div>
      </div>
    </div>
  );
}

