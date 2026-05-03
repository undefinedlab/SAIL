"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  discoverAgent,
  getCommitment,
  getAgentCommitments,
  receiveAxlMessages,
  sendAxlMessage,
  auditCommitment,
  type DiscoveredAgent,
  type AuditCommitmentResult,
} from "@/lib/sail-api";
import {
  SEAL_AX_TOPIC,
  buildAuditRequestMessage,
  parseAuditResponseMessage,
} from "@/lib/audit-message";
import { useBackendStatus } from "@/lib/hooks/useBackendStatus";
import { sailApiLabel } from "@/lib/wagmi-config";
import { IntegrationStatusCards } from "@/components/dashboard/IntegrationStatusCards";

type RequestMode = "ens" | "commitment";

function shortPeer(peerId: string) {
  return peerId.length > 24 ? `${peerId.slice(0, 14)}…${peerId.slice(-8)}` : peerId;
}

function normalizeCommitmentHashHex(input: string): `0x${string}` | null {
  const t = input.trim();
  if (!t) return null;
  const h = t.startsWith("0x") ? t : `0x${t}`;
  if (!/^0x[0-9a-fA-F]{64}$/i.test(h)) return null;
  return h as `0x${string}`;
}

function formatAxlSendError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/aborted|AbortError|timeout|timed out/i.test(m)) {
    return `${m} If the UI “spins” then fails, the API is not reaching the AXL bridge in time. For a local AXL node, set env SAIL_API_PROXY_TARGET to your SAIL backend (e.g. http://localhost:3001) in next.config / env and restart the dev server, then ensure the AXL node and bridge URL in the backend .env are running.`;
  }
  return m;
}

type FormalOutbound = {
  requestId: string;
  agentEns: string;
  operatorPeer: string;
  sentAt: number;
  outcome?: "accepted" | "denied";
  commitmentHash?: string;
};

export function SailAuditorPanel() {
  const { address } = useAccount();
  const backend = useBackendStatus();
  const axlMeshDown = backend.status === "online" && backend.axlOnline === false;

  const [requestMode, setRequestMode] = useState<RequestMode>("ens");

  const [requestEns, setRequestEns] = useState("");
  const [commitmentHashInput, setCommitmentHashInput] = useState("");
  const [resolvedCommitmentHash, setResolvedCommitmentHash] = useState<string | null>(null);
  const [commitmentPreview, setCommitmentPreview] = useState<{
    cid: string;
    executed: boolean;
  } | null>(null);

  const [requestDiscover, setRequestDiscover] = useState<DiscoveredAgent | null>(null);
  const [requestDiscoverBusy, setRequestDiscoverBusy] = useState(false);
  const [requestDiscoverError, setRequestDiscoverError] = useState<string | null>(null);

  type CommitmentRow = {
    commitmentHash: string;
    cid: string;
    nonce: string;
    timestamp: string;
    executed: boolean;
    txHash: string;
  };
  const [agentCommitments, setAgentCommitments] = useState<CommitmentRow[]>([]);
  const [requestSendBusy, setRequestSendBusy] = useState(false);
  const [requestSendError, setRequestSendError] = useState<string | null>(null);
  const [formalOutbound, setFormalOutbound] = useState<FormalOutbound[]>([]);

  function clearDiscoverState() {
    setRequestDiscover(null);
    setRequestDiscoverError(null);
    setCommitmentPreview(null);
    setResolvedCommitmentHash(null);
  }

  useEffect(() => {
    clearDiscoverState();
    setRequestEns("");
    setCommitmentHashInput("");
  }, [requestMode]);

  const modeTabCls = (m: RequestMode) =>
    `rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
      requestMode === m
        ? "bg-[#05058a] text-white shadow-sm"
        : "border border-[#05058a]/20 bg-white text-[#05058a]/80 hover:border-[#05058a]/45"
    }`;

  async function handleRequestDiscover() {
    setRequestDiscoverBusy(true);
    setRequestDiscoverError(null);
    setRequestDiscover(null);
    setCommitmentPreview(null);
    setResolvedCommitmentHash(null);
    setAgentCommitments([]);

    try {
      if (!requestEns.trim()) throw new Error("Enter agent ENS (e.g. myagent.sail.eth)");
      const d = await discoverAgent(requestEns.trim());
      setRequestDiscover(d);
      if (!d.records?.axl_peer_id?.trim()) {
        setRequestDiscoverError(
          "No axl_peer_id on this ENS record — the operator must publish an AXL peer id for mesh delivery.",
        );
      }
      // Fetch commitment history in parallel
      try {
        const { commitments } = await getAgentCommitments(requestEns.trim());
        setAgentCommitments([...commitments].reverse()); // newest first
      } catch { /* not fatal */ }
    } catch (error) {
      setRequestDiscoverError((error as Error).message);
    } finally {
      setRequestDiscoverBusy(false);
    }
  }

  async function handleResolveByCommitmentHash() {
    setRequestDiscoverBusy(true);
    setRequestDiscoverError(null);
    setRequestDiscover(null);
    setRequestEns("");
    setCommitmentPreview(null);
    setResolvedCommitmentHash(null);

    try {
      const hash = normalizeCommitmentHashHex(commitmentHashInput);
      if (!hash) {
        throw new Error("Enter a 32-byte commitment hash (0x + 64 hex characters).");
      }
      const { commitment, resolvedEns } = await getCommitment(hash);
      if (!resolvedEns?.trim()) {
        throw new Error(
          "Could not resolve agent ENS for this hash (commit tx must be a direct SAIL commit() call).",
        );
      }
      setResolvedCommitmentHash(hash);
      setRequestEns(resolvedEns.trim());
      setCommitmentPreview({ cid: commitment.cid, executed: commitment.executed });

      const d = await discoverAgent(resolvedEns.trim());
      setRequestDiscover(d);
      if (!d.records?.axl_peer_id?.trim()) {
        setRequestDiscoverError(
          "No axl_peer_id on this ENS record — the operator must publish an AXL peer id for mesh delivery.",
        );
      }
    } catch (error) {
      setRequestDiscoverError((error as Error).message);
    } finally {
      setRequestDiscoverBusy(false);
    }
  }

  async function handleSendFormalAuditRequest() {
    setRequestSendBusy(true);
    setRequestSendError(null);

    try {
      if (!address) throw new Error("Connect wallet — the request includes your auditor address.");
      const peer = requestDiscover?.records?.axl_peer_id?.trim();
      if (!peer) throw new Error("Discover the operator first and ensure axl_peer_id is present.");
      const ens = requestEns.trim();
      if (!ens) throw new Error("Agent ENS is required to address the request.");

      const requestId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const commitmentOpts =
        requestMode === "commitment" && resolvedCommitmentHash
          ? { commitmentHash: resolvedCommitmentHash }
          : undefined;

      const message = buildAuditRequestMessage(requestId, ens, address, commitmentOpts);
      await sendAxlMessage({
        to: peer,
        topic: SEAL_AX_TOPIC,
        message,
      });

      setFormalOutbound((prev) => [
        {
          requestId,
          agentEns: ens,
          operatorPeer: peer,
          sentAt: Date.now(),
          commitmentHash: commitmentOpts?.commitmentHash,
        },
        ...prev,
      ]);
    } catch (error) {
      setRequestSendError(formatAxlSendError(error));
      void backend.refresh();
    } finally {
      setRequestSendBusy(false);
    }
  }

  useEffect(() => {
    if (backend.status !== "online") return;

    const tick = async () => {
      try {
        const { messages } = await receiveAxlMessages();
        setFormalOutbound((prev) => {
          const next = prev.map((row) => {
            if (row.outcome) return row;
            for (const m of messages) {
              const r = parseAuditResponseMessage(m.message);
              if (r && r.requestId === row.requestId) {
                const outcome: FormalOutbound["outcome"] =
                  r.kind === "accept" ? "accepted" : "denied";
                return {
                  ...row,
                  outcome,
                };
              }
            }
            return row;
          });
          const changed = next.some((row, i) => row !== prev[i]);
          return changed ? next : prev;
        });
      } catch {
        /* ignore transport errors */
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 6000);
    return () => clearInterval(id);
  }, [backend.status]);

  // ---- Commitment browser — loads after ENS discovery ----
  const [commitmentBrowserBusy, setCommitmentBrowserBusy] = useState(false);
  const [commitmentBrowserError, setCommitmentBrowserError] = useState<string | null>(null);

  async function handleBrowseCommitments(ens: string) {
    setCommitmentBrowserBusy(true);
    setCommitmentBrowserError(null);
    setAgentCommitments([]);
    try {
      const data = await getAgentCommitments(ens);
      setAgentCommitments(
        [...data.commitments].reverse().map((c) => ({
          commitmentHash: c.commitmentHash,
          cid: c.cid,
          nonce: c.nonce,
          executed: c.executed,
          timestamp: c.timestamp,
          txHash: c.txHash,
        })),
      );
    } catch (err) {
      setCommitmentBrowserError((err as Error).message);
    } finally {
      setCommitmentBrowserBusy(false);
    }
  }

  // ---- Decrypt & Verify section ----
  const [decryptHashInput, setDecryptHashInput] = useState("");
  const [decryptBusy, setDecryptBusy] = useState(false);
  const [decryptResult, setDecryptResult] = useState<AuditCommitmentResult | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  async function handleDecryptAndVerify() {
    setDecryptBusy(true);
    setDecryptError(null);
    setDecryptResult(null);
    try {
      const hash = normalizeCommitmentHashHex(decryptHashInput);
      if (!hash) throw new Error("Enter a 32-byte commitment hash (0x + 64 hex characters).");
      const result = await auditCommitment(hash, address ?? undefined);
      setDecryptResult(result);
    } catch (err) {
      setDecryptError((err as Error).message);
    } finally {
      setDecryptBusy(false);
    }
  }

  // Auto-fill decrypt hash from the first accepted outbound request that has a commitmentHash
  const firstAcceptedHash = formalOutbound.find(
    (r) => r.outcome === "accepted" && r.commitmentHash,
  )?.commitmentHash;

  const canSend =
    !axlMeshDown &&
    requestEns.trim() &&
    requestDiscover?.records?.axl_peer_id?.trim() &&
    (requestMode === "ens" || (requestMode === "commitment" && resolvedCommitmentHash));

  return (
    <div className="space-y-0 text-sm">
      <div className="space-y-3 border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <IntegrationStatusCards backend={backend} variant="compact" />
        </div>
        {axlMeshDown ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            AXL Mesh is offline on this API host — outbound audit requests cannot be delivered. Start the AXL node (match{" "}
            <code className="rounded bg-white/80 px-1 font-mono text-[10px]">{backend.axlBridgeUrl ?? "AXL_BRIDGE_URL"}</code>
            ) or point the Next.js API proxy at a backend where AXL is up (<code className="rounded bg-white/80 px-1 font-mono text-[10px]">SAIL_API_PROXY_TARGET</code>
            ).
          </p>
        ) : null}
        <p className="rounded border border-[#05058a]/20 bg-[#f4f6ff] px-3 py-2 text-xs text-[#0a1857]">
          <strong className="font-medium">Same backend URL as the operator:</strong> Send uses{" "}
          <code className="rounded bg-white px-1 font-mono text-[10px]">{sailApiLabel}</code>. The operator&apos;s Reveal inbox polls{" "}
          <code className="font-mono text-[10px]">GET /api/axl/recv</code> on that same host — if their Next proxy points elsewhere, their inbox is a different AXL queue than yours. Matching ENS to a peer id only proves DNS/state lines up; it does not route packets across two Railway vs localhost backends or through NAT.
        </p>
      </div>

      <div className="pt-5">
        <main className="min-w-0">
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Send a formal SEAL — Audit request to the operator’s AXL peer (from ENS text record{" "}
              <code className="rounded bg-neutral-100 px-1 font-mono text-[11px]">axl_peer_id</code>
              ). The operator can Accept or Deny over the same channel (topic{" "}
              <code className="rounded bg-neutral-100 px-1 font-mono text-[11px]">{SEAL_AX_TOPIC}</code>
              ).  </p>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Request target">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">Target</span>
              <button type="button" className={modeTabCls("ens")} onClick={() => setRequestMode("ens")}>
                By ENS
              </button>
              <button
                type="button"
                className={modeTabCls("commitment")}
                onClick={() => setRequestMode("commitment")}
              >
                By commitment hash
              </button>
            </div>

            {requestMode === "ens" ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="w-full min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
                  placeholder="Agent ENS (e.g. myagent.sail.eth)"
                  value={requestEns}
                  onChange={(e) => setRequestEns(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleRequestDiscover()}
                />
                <button
                  type="button"
                  onClick={() => void handleRequestDiscover()}
                  disabled={requestDiscoverBusy || backend.status !== "online"}
                  className="shrink-0 rounded border border-[#05058a] px-4 py-2 text-sm text-[#05058a] disabled:opacity-40"
                >
                  {requestDiscoverBusy ? "Discovering…" : "Discover"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className="w-full min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                    placeholder="Commitment hash (0x + 64 hex)"
                    value={commitmentHashInput}
                    onChange={(e) => setCommitmentHashInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleResolveByCommitmentHash()}
                  />
                  <button
                    type="button"
                    onClick={() => void handleResolveByCommitmentHash()}
                    disabled={requestDiscoverBusy || backend.status !== "online"}
                    className="shrink-0 rounded border border-[#05058a] px-4 py-2 text-sm text-[#05058a] disabled:opacity-40"
                  >
                    {requestDiscoverBusy ? "Resolving…" : "Resolve"}
                  </button>
                </div>
                {requestEns.trim() ? (
                  <p className="text-xs text-neutral-600">
                    Resolved agent:{" "}
                    <span className="font-mono font-medium text-[#05058a]">{requestEns}</span>
                  </p>
                ) : null}
                {commitmentPreview ? (
                  <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600">
                    <span className="font-medium text-neutral-700">On-chain commitment</span>
                    <span className="ml-2">
                      execute gate:{" "}
                      <span className={commitmentPreview.executed ? "text-emerald-700" : "text-amber-800"}>
                        {commitmentPreview.executed ? "cleared" : "pending"}
                      </span>
                    </span>
                    {commitmentPreview.cid ? (
                      <p className="mt-1 break-all font-mono text-[10px] text-neutral-500">{commitmentPreview.cid}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {requestDiscoverError ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{requestDiscoverError}</p>
            ) : null}

            {requestDiscover?.records?.axl_peer_id ? (
              <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
                <p className="font-medium text-[#05058a]">Operator AXL peer</p>
                <p className="mt-1 break-all font-mono text-[11px] text-neutral-700">{requestDiscover.records.axl_peer_id}</p>
                <p className="mt-1 text-[10px] text-neutral-500">{shortPeer(requestDiscover.records.axl_peer_id)}</p>
              </div>
            ) : null}

            {requestDiscover && requestEns.trim() && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleBrowseCommitments(requestEns.trim())}
                  disabled={commitmentBrowserBusy || backend.status !== "online"}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-[11px] hover:bg-neutral-50 disabled:opacity-40"
                >
                  {commitmentBrowserBusy ? "Loading…" : agentCommitments.length ? "↻ Refresh commitments" : "Load on-chain commitments"}
                </button>
                {commitmentBrowserError && (
                  <span className="text-[11px] text-red-600">{commitmentBrowserError}</span>
                )}
              </div>
            )}

            {agentCommitments.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  On-chain commitments ({agentCommitments.length}) — click to select for audit
                </p>
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {agentCommitments.map((c) => (
                    <li key={c.commitmentHash}>
                      <button
                        type="button"
                        onClick={() => setDecryptHashInput(c.commitmentHash)}
                        className={`w-full rounded border px-3 py-2 text-left text-[11px] transition-colors hover:border-[#05058a]/40 hover:bg-[#f0f2ff] ${
                          decryptHashInput === c.commitmentHash
                            ? "border-[#05058a]/50 bg-[#f0f2ff]"
                            : "border-neutral-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="break-all font-mono text-[10px] text-neutral-700">
                            {c.commitmentHash.slice(0, 18)}…{c.commitmentHash.slice(-8)}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${c.executed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {c.executed ? "executed" : "pending"}
                            </span>
                            <span className="text-[10px] text-neutral-400">nonce {c.nonce}</span>
                          </div>
                        </div>
                        {c.timestamp ? (
                          <p className="mt-0.5 text-[10px] text-neutral-400">
                            {new Date(Number(c.timestamp) * 1000).toLocaleString()}
                          </p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSendFormalAuditRequest()}
              disabled={requestSendBusy || backend.status !== "online" || !canSend}
              className="rounded bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
              title={
                axlMeshDown
                  ? "AXL Mesh must be online on the API server"
                  : !requestDiscover?.records?.axl_peer_id?.trim()
                    ? "Discover / resolve first"
                    : undefined
              }
            >
              {requestSendBusy ? "Sending…" : "Send formal audit request"}
            </button>
            {!address ? (
              <p className="text-xs text-amber-700">Connect your wallet so the wire message includes your auditor address.</p>
            ) : null}

            {requestSendError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{requestSendError}</p>
            ) : null}

            {formalOutbound.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Outbound requests</p>
                <ul className="space-y-2">
                  {formalOutbound.map((row) => (
                    <li key={row.requestId} className="rounded border border-neutral-200 bg-white px-3 py-2 text-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-neutral-600">{row.agentEns}</span>
                        {row.outcome ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              row.outcome === "accepted"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {row.outcome === "accepted" ? "Accepted" : "Denied"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-700">Awaiting operator…</span>
                        )}
                      </div>
                      {row.commitmentHash ? (
                        <p className="mt-1 break-all font-mono text-[10px] text-neutral-500">
                          commitment: {row.commitmentHash}
                        </p>
                      ) : null}
                      <p className="mt-1 break-all font-mono text-[10px] text-neutral-400">id: {row.requestId}</p>
                      <p className="text-[10px] text-neutral-500">To peer: {shortPeer(row.operatorPeer)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* ---- Decrypt & Verify ---- */}
            <div className="mt-6 space-y-3 rounded border border-[#05058a]/20 bg-[#f4f6ff] p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#05058a]">
                  Decrypt &amp; Verify commitment
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Calls{" "}
                  <code className="rounded bg-white px-1 font-mono text-[10px]">GET /api/audit/:hash</code>{" "}
                  with your wallet as the auditor. Backend decrypts via Lit Chipotle (enforcing{" "}
                  <code className="font-mono text-[10px]">SAIL.isAuthorized</code> on-chain inside the TEE)
                  and verifies <code className="font-mono text-[10px]">keccak256(plaintext) === commitmentHash</code>.
                </p>
                {!address && (
                  <p className="mt-1 text-[11px] text-amber-700">Connect wallet — your address is passed as the auditor.</p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="w-full min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1.5 font-mono text-xs"
                  placeholder="0x… (32-byte commitment hash)"
                  value={decryptHashInput || firstAcceptedHash || ""}
                  onChange={(e) => setDecryptHashInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleDecryptAndVerify()}
                />
                <button
                  type="button"
                  onClick={() => void handleDecryptAndVerify()}
                  disabled={decryptBusy || backend.status !== "online" || !address}
                  className="shrink-0 rounded bg-[#05058a] px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  {decryptBusy ? "Decrypting…" : "Decrypt & Verify"}
                </button>
              </div>

              {firstAcceptedHash && !decryptHashInput && (
                <p className="text-[10px] text-neutral-500">
                  Auto-filled from accepted request.{" "}
                  <button
                    type="button"
                    className="text-[#05058a] underline"
                    onClick={() => setDecryptHashInput(firstAcceptedHash)}
                  >
                    Lock in
                  </button>
                </p>
              )}

              {decryptError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {decryptError}
                </p>
              )}

              {decryptResult && (
                <div className="space-y-3 rounded border border-neutral-200 bg-white p-4 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        decryptResult.hashVerified
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {decryptResult.hashVerified ? "✓ Hash verified" : "✗ Hash mismatch"}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700">
                      {decryptResult.decryptMode}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        decryptResult.onChain.executed
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {decryptResult.onChain.executed ? "executed" : "not executed"}
                    </span>
                  </div>

                  {decryptResult.note && (
                    <p className="text-[11px] text-neutral-600">{decryptResult.note}</p>
                  )}

                  <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
                    <div>
                      <dt className="text-neutral-400">on-chain inputHash</dt>
                      <dd className="break-all font-mono text-[10px]">{decryptResult.onChain.inputHash}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-400">CID (0G Storage)</dt>
                      <dd className="break-all font-mono text-[10px]">{decryptResult.onChain.cid}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-400">nonce</dt>
                      <dd className="font-mono">{decryptResult.onChain.nonce}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-400">anchored at</dt>
                      <dd>
                        {decryptResult.onChain.timestamp
                          ? new Date(Number(decryptResult.onChain.timestamp) * 1000).toLocaleString()
                          : "—"}
                      </dd>
                    </div>
                  </dl>

                  {decryptResult.plaintext && (
                    <div className="space-y-2 border-t border-neutral-100 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Decrypted plaintext
                      </p>
                      <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
                        <div>
                          <dt className="text-neutral-400">agentEns</dt>
                          <dd className="font-mono">{decryptResult.plaintext.agentEns}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400">inputHash (plaintext)</dt>
                          <dd className="break-all font-mono text-[10px]">{decryptResult.plaintext.inputHash}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-neutral-400">decision</dt>
                          <dd className="whitespace-pre-wrap break-words">{decryptResult.plaintext.decision}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-neutral-400">proposedAction</dt>
                          <dd className="whitespace-pre-wrap break-words">{decryptResult.plaintext.proposedAction}</dd>
                        </div>
                        {decryptResult.plaintext.attestation && (
                          <div className="sm:col-span-2">
                            <dt className="text-neutral-400">TEE attestation</dt>
                            <dd className="break-all font-mono text-[10px]">{decryptResult.plaintext.attestation}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-neutral-400">committed at</dt>
                          <dd>{new Date(decryptResult.plaintext.timestamp).toLocaleString()}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
