"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { formatEther, isAddress, keccak256, stringToBytes } from "viem";
import { sailAbi } from "@/lib/sail-abi";
import { expectedChain, sailApiBase, sailContractAddress } from "@/lib/wagmi-config";
import { OperatorsPanel } from "./operators";

type RevealResult = { plaintext: string; cid: string } | null;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#05058a]/15 bg-white px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg text-[#2020e8]">{value}</p>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
      <dt className="text-[#05058a]/60">{k}</dt>
      <dd className="break-all font-mono text-[#05058a] sm:max-w-[70%] sm:text-right">
        {v}
      </dd>
    </div>
  );
}

function fmtUint(v: unknown): string {
  if (v === undefined || v === null) return "—";
  return String(v);
}

function fmtEth(v: unknown): string {
  if (v === undefined || v === null || typeof v !== "bigint") return "—";
  try {
    return `${formatEther(v)} ETH`;
  } catch {
    return "—";
  }
}

type Health = { status: string; service?: string; timestamp?: number };

export function DashboardClient() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();

  const contractOk = isAddress(sailContractAddress);
  const addr = contractOk ? sailContractAddress : undefined;
  const enabled = { query: { enabled: contractOk } as const };

  const { data: commitmentCount, isLoading: lc0 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "commitmentCount",
    ...enabled,
  });
  const { data: executionCount, isLoading: lc1 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "executionCount",
    ...enabled,
  });
  const { data: disputeCount, isLoading: lc2 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "disputeCount",
    ...enabled,
  });
  const { data: disputeBond, isLoading: lc3 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "disputeBond",
    ...enabled,
  });
  const { data: disputePeriod, isLoading: lc4 } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "disputePeriod",
    ...enabled,
  });

  const statsLoading = lc0 || lc1 || lc2 || lc3 || lc4;

  const [taskIdInput, setTaskIdInput] = useState("treasury-demo");
  const taskId = useMemo(() => {
    if (!taskIdInput.trim()) return undefined;
    return keccak256(stringToBytes(taskIdInput.trim()));
  }, [taskIdInput]);

  const { data: commitment, isLoading: commitmentLoading } = useReadContract({
    address: contractOk ? sailContractAddress : undefined,
    abi: sailAbi,
    functionName: "getCommitment",
    args: taskId ? [taskId] : undefined,
    query: { enabled: contractOk && !!taskId },
  });

  const wrongChain = isConnected && chainId !== expectedChain.id;
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [revealCid, setRevealCid] = useState("");
  const [revealKey, setRevealKey] = useState("");
  const [revealIv, setRevealIv] = useState("");
  const [revealPk, setRevealPk] = useState("");
  const [revealResult, setRevealResult] = useState<RevealResult>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);

  async function doReveal() {
    setRevealError(null);
    setRevealResult(null);
    setRevealLoading(true);
    try {
      const res = await fetch(`${sailApiBase}/api/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid: revealCid,
          encryptedKey: JSON.parse(revealKey),
          iv: revealIv,
          requesterPk: revealPk,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reveal failed");
      setRevealResult(data);
    } catch (e: unknown) {
      setRevealError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevealLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`${sailApiBase}/health`)
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

  const steps = [
    {
      id: "01",
      title: "Backend online",
      ok: health?.status === "ok",
      warn: Boolean(healthError),
      detail: healthError
        ? `API unreachable (${healthError})`
        : health
          ? `Backend ${health.service ?? "ok"}`
          : `API: ${sailApiBase}`,
    },
    {
      id: "02",
      title: "Wallet connected",
      ok: isConnected,
      warn: false,
      detail:
        isConnected && address
          ? `${address.slice(0, 6)}…${address.slice(-4)}`
          : "Connect to read contract",
    },
    {
      id: "03",
      title: "Correct network",
      ok: !wrongChain,
      warn: isConnected && wrongChain,
      detail: wrongChain ? `Switch to ${expectedChain.name}` : expectedChain.name,
    },
    {
      id: "04",
      title: "Contract configured",
      ok: contractOk,
      warn: !contractOk,
      detail: contractOk ? sailContractAddress : "Set NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS",
    },
  ];

  return (
    <div className="w-full">
      <div className="border border-[#05058a]/15 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[62rem]">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              dashboard
            </p>
            <h1 className="mt-3 text-[clamp(34px,4.8vw,62px)] font-black leading-[0.95] tracking-[-0.03em] text-[#05058a]">
              Demo control room
            </h1>
            <p className="mt-4 max-w-[56rem] text-sm leading-relaxed text-[#05058a]/70">
              Choose a journey, then show its on-chain commitment and explain the selective-reveal audit path.
            </p>
          </div>

          <div className="w-full md:w-auto md:text-right">
            <div className="md:hidden">
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a]/55 md:mt-2">
              Stakeholder view
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Setup status
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {steps.map((s) => (
              <div
                key={s.id}
                className={`border px-4 py-3 ${
                  s.ok
                    ? "border-[#05058a]/15 bg-white"
                    : s.warn
                      ? "border-amber-300 bg-amber-50"
                      : "border-[#05058a]/15 bg-[#f5f5f0]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] text-[#2020e8]">{s.id}</p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#05058a]/55">
                    {s.ok ? "ready" : "todo"}
                  </p>
                </div>
                <p className="mt-2 text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  {s.title}
                </p>
                <p className="mt-1 text-xs text-[#05058a]/65">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <div className="border border-[#05058a]/15 bg-white p-6">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              What this dashboard does
            </p>
            <div className="mt-5 grid gap-3">
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-4">
                <p className="text-sm font-black text-[#05058a]">Proof 1 — Commit-before-execute</p>
                <p className="mt-2 text-sm leading-relaxed text-[#05058a]/70">
                  We show a task’s commitment on-chain: <span className="font-mono">merkleRoot</span>,{" "}
                  <span className="font-mono">nonce</span>, timestamps, and submitter.
                </p>
              </div>
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-4">
                <p className="text-sm font-black text-[#05058a]">Proof 2 — Execution consistency</p>
                <p className="mt-2 text-sm leading-relaxed text-[#05058a]/70">
                  We show the <span className="font-mono">executionHash</span> tied to the same commitment bundle.
                </p>
              </div>
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-4">
                <p className="text-sm font-black text-[#05058a]">Proof 3 — Stakeholder reveal path</p>
                <p className="mt-2 text-sm leading-relaxed text-[#05058a]/70">
                  Next: authorize reveal → decrypt blob → verify merkle proof → inspect TEE quote.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              Choose a journey
            </p>
            <p className="mt-2 text-sm text-[#05058a]/70">This sets the task id for lookup.</p>

            <div className="mt-5 grid gap-3">
              {[
                {
                  title: "Journey 1",
                  name: "DAO treasury agent",
                  taskId: "treasury-demo",
                },
                {
                  title: "Journey 2",
                  name: "Agent-to-agent pipeline",
                  taskId: "agent-to-agent-demo",
                },
                {
                  title: "Journey 3",
                  name: "Credential-proof (Lit vault)",
                  taskId: "credential-proof-demo",
                },
              ].map((j) => (
                <button
                  key={j.taskId}
                  type="button"
                  onClick={() => setTaskIdInput(j.taskId)}
                  className="text-left border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-3 transition-colors hover:bg-white"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[11px] text-[#2020e8]">{j.title}</span>
                    <span className="font-mono text-[11px] text-[#05058a]/55">
                      task: {j.taskId}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-black tracking-[-0.01em] text-[#05058a]">
                    {j.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="lg:col-span-7">
          <div className="border border-[#05058a]/15 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
                  Live contract state
                </p>
                <p className="mt-2 text-sm text-[#05058a]/70">
                  Reads from your wallet RPC when connected ({expectedChain.name}).
                </p>
              </div>
              {wrongChain && (
                <span className="border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-950">
                  Switch to {expectedChain.name}
                </span>
              )}
              {!contractOk && (
                <span className="border border-[#05058a]/20 bg-[#f5f5f0] px-3 py-1.5 text-xs text-[#05058a]/70">
                  Set <span className="font-mono">NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS</span>
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="Commitments" value={statsLoading ? "…" : fmtUint(commitmentCount)} />
              <Stat label="Executions" value={statsLoading ? "…" : fmtUint(executionCount)} />
              <Stat label="Disputes" value={statsLoading ? "…" : fmtUint(disputeCount)} />
              <Stat label="Dispute bond" value={statsLoading ? "…" : fmtEth(disputeBond)} />
              <Stat label="Dispute period (s)" value={statsLoading ? "…" : fmtUint(disputePeriod)} />
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                  Backend
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#05058a]/70">
                  {sailApiBase}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
                  Commitment viewer
                </p>
                <p className="mt-2 text-sm text-[#05058a]/70">
                  Enter a task id (string). We hash it before calling{" "}
                  <span className="font-mono">getCommitment</span>.
                </p>
              </div>
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#05058a]/55">
                  What to say in demo
                </p>
                <p className="mt-2 text-xs text-[#05058a]/70">
                  “This merkle root anchors the reasoning + execution bundle before any tx is sent.”
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <input
                value={taskIdInput}
                onChange={(e) => setTaskIdInput(e.target.value)}
                className="min-w-[220px] flex-1 border border-[#05058a]/30 bg-[#f5f5f0] px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
                placeholder="e.g. treasury-demo"
              />
            </div>

            <div className="mt-4 border border-[#05058a]/15 bg-[#f5f5f0] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#05058a]/55">
                getCommitment
              </p>
              {commitmentLoading ? (
                <p className="mt-3 text-sm text-[#05058a]/70">Loading…</p>
              ) : commitment ? (
                <dl className="mt-4 space-y-2 text-xs">
                  <KV k="committed" v={String(commitment[0])} />
                  <KV k="executed" v={String(commitment[1])} />
                  <KV k="merkleRoot" v={String(commitment[2])} />
                  <KV k="nonce" v={String(commitment[3])} />
                  <KV k="timestamp" v={String(commitment[4])} />
                  <KV k="submitter" v={String(commitment[5])} />
                  <KV k="executionHash" v={String(commitment[6])} />
                </dl>
              ) : (
                <p className="mt-3 text-sm text-[#05058a]/70">No data for this task id.</p>
              )}
            </div>
          </div>

          <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              Selective reveal
            </p>
            <p className="mt-2 text-sm text-[#05058a]/70">
              Lit-gated decrypt — paste the CID, encrypted key, IV and your private key to reveal the reasoning blob.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                {([
                  { label: "CID (Storacha)", placeholder: "bafybei…", value: revealCid, set: setRevealCid, type: "text" },
                  { label: "Encrypted key (JSON)", placeholder: '{"ciphertext":"…","dataToEncryptHash":"…"}', value: revealKey, set: setRevealKey, type: "text" },
                  { label: "IV (hex)", placeholder: "a1b2c3…", value: revealIv, set: setRevealIv, type: "text" },
                  { label: "Requester private key", placeholder: "0x…", value: revealPk, set: setRevealPk, type: "password" },
                ] as const).map((f) => (
                  <div key={f.label} className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">{f.label}</label>
                    <input
                      type={f.type}
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="border border-[#05058a]/20 bg-[#f5f5f0] px-3 py-2 font-mono text-xs text-[#05058a] outline-none focus:border-[#05058a]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={doReveal}
                  disabled={revealLoading || !revealCid || !revealKey || !revealIv || !revealPk}
                  className="mt-1 bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {revealLoading ? "Decrypting…" : "Request reveal"}
                </button>
              </div>
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Verification output</p>
                {revealError && (
                  <div className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {revealError}
                  </div>
                )}
                {revealResult ? (
                  <div className="mt-3 space-y-3">
                    <div className="border border-[#05058a]/20 bg-white px-3 py-2 text-xs text-[#2020e8]">
                      ✓ Lit access condition satisfied
                    </div>
                    <div className="border border-[#05058a]/20 bg-white px-3 py-2 text-xs text-[#2020e8]">
                      ✓ AES-256-GCM decryption verified
                    </div>
                    <pre className="max-h-48 overflow-auto border border-[#05058a]/15 bg-white p-3 text-[11px] leading-relaxed text-[#05058a]/80">
                      {revealResult.plaintext}
                    </pre>
                  </div>
                ) : (
                  <ul className="mt-3 list-disc pl-5 text-[13px] leading-relaxed text-[#05058a]/70">
                    <li>Merkle proof matches on-chain root</li>
                    <li>TEE quote covers execution hash</li>
                    <li>Reveal policy satisfied (who/when)</li>
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

