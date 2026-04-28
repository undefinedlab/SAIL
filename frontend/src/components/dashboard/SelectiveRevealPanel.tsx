"use client";

import { useState } from "react";
import { sealApiBase } from "@/lib/wagmi-config";

type RevealResult = { plaintext: string; cid: string } | null;

export function SelectiveRevealPanel() {
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
      const res = await fetch(`${sealApiBase}/api/reveal`, {
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

  return (
    <div className="border border-[#05058a]/15 bg-white p-6">
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
  );
}

