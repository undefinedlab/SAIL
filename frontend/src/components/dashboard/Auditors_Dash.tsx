"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { getAddress } from "viem";
import { parseApiJson } from "@/lib/api-json";
import { sealApiBase } from "@/lib/wagmi-config";
import { buildAuditRequestMessage } from "@/lib/audit-message";

type AuditStatus = "pending" | "revealed" | "denied";

type AuditRequest = {
  id: string;
  createdAt: string;
  agentIdBytes32: string;
  auditorAddress: string;
  scope: string;
  message: string;
  signature: string;
  status: AuditStatus;
  note?: string;
  revealedPlaintext?: string;
  revealedAt?: string;
  denyAt?: string;
};

function Pill({ status }: { status: AuditStatus }) {
  const cls =
    status === "revealed"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : status === "denied"
        ? "border-rose-300 bg-rose-50 text-rose-950"
        : "border-amber-300 bg-amber-50 text-amber-950";
  return (
    <span className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${cls}`}>
      {status}
    </span>
  );
}

function shortHex(hex: string, n = 12) {
  if (!hex || hex.length < n + 4) return hex;
  return `${hex.slice(0, n)}…${hex.slice(-6)}`;
}

export function Auditors_Dash() {
  const { isConnected, address } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();

  const [agentIdBytes32, setAgentIdBytes32] = useState("");
  const [note, setNote] = useState("");
  const [requests, setRequests] = useState<AuditRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchMine = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${sealApiBase}/api/audit-requests?auditor=${encodeURIComponent(address)}`);
      const j = (await r.json()) as { requests?: AuditRequest[]; error?: string };
      if (!r.ok) throw new Error(j.error || r.statusText);
      setRequests(j.requests ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchMine();
  }, [fetchMine]);

  const idOk = /^0x[a-fA-F0-9]{64}$/.test(agentIdBytes32.trim());
  const canSubmit = isConnected && !!address && idOk;

  async function submit() {
    if (!address) return;
    setSubmitError(null);
    const raw = agentIdBytes32.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(raw)) {
      setSubmitError("Agent id must be 0x + 64 hex characters.");
      return;
    }
    const auditor = getAddress(address);
    const message = buildAuditRequestMessage(raw, auditor);
    const sig = await signMessageAsync({ message });

    const res = await fetch(`${sealApiBase}/api/audit-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentIdBytes32: raw,
        auditorAddress: auditor,
        message,
        signature: sig,
        scope: "reveal_all",
        note: note.trim() || undefined,
      }),
    });
    const j = await parseApiJson<{ error?: string; request?: AuditRequest }>(res);
    if (!res.ok) throw new Error(j.error || res.statusText);
    await fetchMine();
    if (j.request?.id) setSelectedId(j.request.id);
  }

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="w-full">
      <div className="border border-[#05058a]/15 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[62rem]">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Path B — Auditor portal</p>
            <h1 className="mt-3 text-[clamp(34px,4.8vw,62px)] font-black leading-[0.95] tracking-[-0.03em] text-[#05058a]">
              Auditor portal
            </h1>
            <p className="mt-4 max-w-[56rem] text-sm leading-relaxed text-[#05058a]/70">
              Submit a signed <span className="font-semibold">reveal-all</span> request for a registered agent id. The operator sees it in the Audit request box
              and can reveal encrypted reasoning to this wallet after approval.
            </p>
          </div>

          <div className="w-full md:w-auto md:text-right">
            <div className="md:hidden">
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a]/55 md:mt-2">Auditor identity</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-6">
          <div className="border border-[#05058a]/15 bg-white p-6">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">1) Audit request</p>

            <div className="mt-5 grid gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Agent id (bytes32)</p>
                <input
                  value={agentIdBytes32}
                  onChange={(e) => setAgentIdBytes32(e.target.value.trim())}
                  placeholder="0x + 64 hex (from operator monitor)"
                  className="mt-2 w-full border border-[#05058a]/30 bg-[#f5f5f0] px-3 py-2 font-mono text-sm text-[#05058a] outline-none focus:border-[#05058a]"
                />
                {!agentIdBytes32.trim() ? null : idOk ? null : (
                  <p className="mt-2 text-xs text-amber-900">Expected 66-character hex string.</p>
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Note (optional, not signed)</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Context for the operator…"
                  className="mt-2 min-h-[80px] w-full resize-y border border-[#05058a]/30 bg-[#f5f5f0] px-3 py-2 text-sm text-[#05058a] outline-none focus:border-[#05058a]"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void submit().catch((e: Error) => setSubmitError(e.message))}
                  disabled={!canSubmit || signing}
                  className="bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {signing ? "Signing…" : "Sign + submit to backend"}
                </button>
                <p className="text-xs text-[#05058a]/65">Backend: {sealApiBase}</p>
              </div>
              {submitError ? <p className="text-sm text-rose-800">{submitError}</p> : null}
            </div>
          </div>
        </section>

        <section className="lg:col-span-6">
          <div className="border border-[#05058a]/15 bg-white p-6">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">2) Your requests</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchMine()}
                className="border border-[#05058a]/25 bg-white px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#05058a] hover:bg-[#f5f5f0]"
              >
                Refresh
              </button>
              {loading ? <span className="text-xs text-[#05058a]/55">Loading…</span> : null}
            </div>
            {error ? <p className="mt-3 text-sm text-rose-800">{error}</p> : null}

            {!address ? (
              <p className="mt-4 text-sm text-[#05058a]/70">Connect wallet to list your requests.</p>
            ) : requests.length === 0 ? (
              <p className="mt-4 text-sm text-[#05058a]/70">No requests yet.</p>
            ) : (
              <div className="mt-5 grid gap-3">
                {requests.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`text-left border px-4 py-4 transition-colors ${
                      selectedId === r.id ? "border-[#05058a] bg-white" : "border-[#05058a]/15 bg-[#f5f5f0] hover:bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] text-[#2020e8]">{r.id}</p>
                        <p className="mt-2 font-mono text-xs text-[#05058a]/80">{shortHex(r.agentIdBytes32, 14)}</p>
                        <p className="mt-2 text-xs text-[#05058a]/65">{r.createdAt}</p>
                      </div>
                      <Pill status={r.status} />
                    </div>
                    {r.note ? <p className="mt-2 text-sm text-[#05058a]/70">{r.note}</p> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {selected ? (
        <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">Request detail</p>
          <p className="mt-2 font-mono text-xs text-[#05058a]/80 break-all">{selected.agentIdBytes32}</p>
          <p className="mt-3 text-sm text-[#05058a]/70">
            Status: <span className="font-mono">{selected.status}</span>
          </p>
          {selected.status === "revealed" && selected.revealedPlaintext ? (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">Revealed reasoning (operator approved)</p>
              <pre className="mt-2 max-h-[min(60vh,480px)] overflow-auto border border-[#05058a]/15 bg-[#f5f5f0] p-4 text-[11px] leading-relaxed text-[#05058a]/80">
                {selected.revealedPlaintext}
              </pre>
            </div>
          ) : selected.status === "pending" ? (
            <p className="mt-4 text-sm text-amber-900">Waiting for operator to reveal or deny.</p>
          ) : selected.status === "denied" ? (
            <p className="mt-4 text-sm text-[#05058a]/70">Operator denied this request.</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-6 text-xs text-[#05058a]/55">
        <Link href="/dashboard/operator" className="underline">
          Operator dashboard
        </Link>{" "}
        — incoming requests appear under Audit request box.
      </p>
    </div>
  );
}
