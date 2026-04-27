"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { formatEther, isAddress, keccak256, stringToBytes } from "viem";
import { sailAbi } from "@/lib/sail-abi";
import { expectedChain, sealApiBase, sailContractAddress } from "@/lib/wagmi-config";

type Health = { status: string; service?: string; timestamp?: number };

export function OnChainPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractOk = isAddress(sailContractAddress);
  const addr = contractOk ? sailContractAddress : undefined;
  const statsEnabled = { query: { enabled: contractOk } as const };

  const { data: commitmentCount, isLoading: lc0 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "commitmentCount",
    ...statsEnabled,
  });
  const { data: executionCount, isLoading: lc1 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "executionCount",
    ...statsEnabled,
  });
  const { data: disputeCount, isLoading: lc2 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "disputeCount",
    ...statsEnabled,
  });
  const { data: disputeBond, isLoading: lc3 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "disputeBond",
    ...statsEnabled,
  });
  const { data: disputePeriod, isLoading: lc4 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "disputePeriod",
    ...statsEnabled,
  });
  const { data: owner, isLoading: lc5 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "owner",
    ...statsEnabled,
  });

  const statsLoading = lc0 || lc1 || lc2 || lc3 || lc4 || lc5;

  const [taskIdInput, setTaskIdInput] = useState("treasury-demo");
  const taskIdBytes = useMemo(() => {
    if (!taskIdInput.trim()) return undefined;
    return keccak256(stringToBytes(taskIdInput.trim()));
  }, [taskIdInput]);

  const { data: commitment, isLoading: commitmentLoading } = useReadContract({
    address: contractOk ? sailContractAddress : undefined,
    abi: sailAbi,
    functionName: "getCommitment",
    args: taskIdBytes ? [taskIdBytes] : undefined,
    query: { enabled: contractOk && !!taskIdBytes },
  });

  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${sealApiBase}/health`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          setHealth(j);
          setHealthError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setHealth(null);
          setHealthError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wrongChain = isConnected && chainId !== expectedChain.id;

  return (
    <div className="mt-10 border border-[var(--border)] bg-[var(--surface-alt)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="sail-section-label">Live stack</p>
          <h3 className="font-display mt-2 text-xl font-medium text-stone-900">Ethereum Sepolia + SAIL contract</h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Reads use your wallet RPC when connected. Set{" "}
            <code className="rounded-sm border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-xs text-stone-800">
              NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS
            </code>{" "}
            to match the deployed <code className="text-sm text-stone-700">contracts/SAIL.sol</code>.
          </p>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          <p>
            API: <span className="font-mono text-stone-700">{sealApiBase}</span>
          </p>
          {health && (
            <p className="mt-2 font-medium text-[var(--accent-subtle)]">
              Backend {health.status === "ok" ? "●" : "○"} {health.service ?? "ok"}
            </p>
          )}
          {healthError && (
            <p className="mt-2 text-amber-800">Backend unreachable ({healthError})</p>
          )}
        </div>
      </div>

      {wrongChain && (
        <p className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Switch network to Ethereum Sepolia in your wallet to inspect contract state.
        </p>
      )}

      {!contractOk && (
        <p className="mt-4 border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          Add <code className="text-stone-800">NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS</code> to enable on-chain reads.
        </p>
      )}

      {contractOk && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Commitments"
            value={statsLoading ? "…" : formatUint(commitmentCount)}
          />
          <StatCard
            label="Executions"
            value={statsLoading ? "…" : formatUint(executionCount)}
          />
          <StatCard
            label="Disputes"
            value={statsLoading ? "…" : formatUint(disputeCount)}
          />
          <StatCard
            label="Dispute bond"
            value={statsLoading ? "…" : formatEtherWei(disputeBond)}
          />
          <StatCard
            label="Dispute period (s)"
            value={statsLoading ? "…" : formatUint(disputePeriod)}
          />
          <div className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Owner</p>
            <p className="mt-1 break-all font-mono text-xs text-stone-800">
              {statsLoading ? "…" : owner ? String(owner) : "—"}
            </p>
          </div>
        </div>
      )}

      {contractOk && (
        <div className="mt-6 border-t border-[var(--border)] pt-6">
          <p className="text-xs text-[var(--muted)]">
            Task id (string, hashed like ethers.id / keccak256(utf8))
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={taskIdInput}
              onChange={(e) => setTaskIdInput(e.target.value)}
              className="min-w-[200px] flex-1 border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-stone-900 outline-none focus:border-stone-900"
              placeholder="e.g. treasury-1730000000-abc123"
            />
          </div>
          <div className="mt-3 border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-500">getCommitment</p>
            {commitmentLoading ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Loading…</p>
            ) : commitment ? (
              <dl className="mt-3 space-y-2 font-mono text-xs text-stone-800">
                <Row k="committed" v={String(commitment[0])} />
                <Row k="executed" v={String(commitment[1])} />
                <Row k="merkleRoot" v={String(commitment[2])} />
                <Row k="nonce" v={String(commitment[3])} />
                <Row k="timestamp" v={String(commitment[4])} />
                <Row k="submitter" v={String(commitment[5])} />
                <Row k="executionHash" v={String(commitment[6])} />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">No data for this task id.</p>
            )}
          </div>
        </div>
      )}

      {isConnected && address && (
        <p className="mt-4 font-mono text-[11px] text-[var(--muted-light)]">
          Connected{" "}
          <span className="text-stone-600">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-medium text-[var(--accent-subtle)]">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className="break-all text-right text-stone-800 sm:max-w-[70%]">{v}</dd>
    </div>
  );
}

function formatUint(v: unknown): string {
  if (v === undefined || v === null) return "—";
  return String(v);
}

function formatEtherWei(v: unknown): string {
  if (v === undefined || v === null || typeof v !== "bigint") return "—";
  try {
    return `${formatEther(v)} ETH`;
  } catch {
    return "—";
  }
}
