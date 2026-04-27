"use client";

import { useState } from "react";
import { sealApiBase } from "@/lib/wagmi-config";

const stages = [
  { id: "01", label: "Inputs attested" },
  { id: "02", label: "Reasoned in TEE" },
  { id: "03", label: "Committed + attested" },
  { id: "04", label: "Executed in TEE" },
  { id: "05", label: "Delivery committed" },
  { id: "06", label: "Blob on Storacha" },
];

export function RevealDemo() {
  const [cid, setCid] = useState("");
  const [encryptedKey, setEncryptedKey] = useState("");
  const [iv, setIv] = useState("");
  const [requesterPk, setRequesterPk] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestReveal() {
    setError(null);
    setPlaintext(null);
    setLoading(true);
    try {
      const res = await fetch(`${sealApiBase}/api/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid,
          encryptedKey: JSON.parse(encryptedKey),
          iv,
          requesterPk,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reveal failed");
      setPlaintext(data.plaintext);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="reveal" className="scroll-mt-16 border-b border-[var(--border)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="sail-section-label">Selective reveal</p>
        <h2 className="font-display mt-4 max-w-3xl text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem]">
          Authorized staker view
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
          Go to the <a href="/dashboard" className="text-[#05058a] underline">Dashboard</a> to inspect on-chain state, view commitments, and reveal encrypted reasoning.
          Connect a wallet for Ethereum Sepolia to interact with the live SAIL contract.
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-5">
          <div className="border border-[var(--border)] bg-(--surface) p-6 shadow-sm shadow-stone-900/5 lg:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sail-section-label">Agent</p>
                <p className="font-display mt-2 text-xl font-medium text-stone-900">Treasury Agent · demo</p>
              </div>
              <span className="rounded-sm border border-[var(--accent-subtle)] bg-stone-50 px-2.5 py-1 text-xs font-medium text-(--accent-subtle)">
                Pipeline complete
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {stages.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-1 text-[11px] text-[var(--muted)]"
                >
                  <span className="font-mono text-(--accent-subtle)">{s.id}</span>
                  {s.label}
                </span>
              ))}
            </div>

            <div className="mt-8 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500">CID (Storacha)</label>
                <input
                  value={cid}
                  onChange={(e) => setCid(e.target.value)}
                  placeholder="bafybei…"
                  className="border border-(--border-strong) bg-(--surface) px-3 py-2 font-mono text-xs text-stone-900 outline-none focus:border-stone-900"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Encrypted key (JSON)</label>
                <input
                  value={encryptedKey}
                  onChange={(e) => setEncryptedKey(e.target.value)}
                  placeholder='{"ciphertext":"…","dataToEncryptHash":"…"}'
                  className="border border-(--border-strong) bg-(--surface) px-3 py-2 font-mono text-xs text-stone-900 outline-none focus:border-stone-900"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500">IV (hex)</label>
                <input
                  value={iv}
                  onChange={(e) => setIv(e.target.value)}
                  placeholder="a1b2c3…"
                  className="border border-(--border-strong) bg-(--surface) px-3 py-2 font-mono text-xs text-stone-900 outline-none focus:border-stone-900"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Requester private key</label>
                <input
                  type="password"
                  value={requesterPk}
                  onChange={(e) => setRequesterPk(e.target.value)}
                  placeholder="0x…"
                  className="border border-(--border-strong) bg-(--surface) px-3 py-2 font-mono text-xs text-stone-900 outline-none focus:border-stone-900"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={requestReveal}
                disabled={loading || !cid || !encryptedKey || !iv || !requesterPk}
                className="rounded-sm bg-stone-900 px-5 py-2.5 text-sm font-medium text-[var(--surface)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "Decrypting…" : "[ Request reveal (staker) ]"}
              </button>
              <span className="text-xs text-[var(--muted-light)]">Lit access condition · live</span>
            </div>
          </div>

          <div className="border border-dashed border-(--border-strong) bg-[var(--surface-alt)]/80 p-6 lg:col-span-2">
            <p className="sail-section-label">Verification</p>
            {error && (
              <div className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
            {plaintext ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="border border-[var(--accent-subtle)]/30 bg-(--surface) px-3 py-2 text-(--accent-subtle)">
                  ✓ Lit access condition satisfied
                </div>
                <div className="border border-[var(--accent-subtle)]/30 bg-(--surface) px-3 py-2 text-(--accent-subtle)">
                  ✓ AES-256-GCM decryption verified
                </div>
                <pre className="max-h-48 overflow-auto border border-[var(--border)] bg-stone-50 p-3 text-[11px] leading-relaxed text-[var(--muted)]">
                  {plaintext}
                </pre>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                Encrypted reasoning and execution payloads stay off-chain until an authorized wallet satisfies Lit
                conditions — then decrypt and diff against the committed root.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}