"use client";

import { useEffect, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { keccak256, type Hex } from "viem";
import { sailAbi, TIER_LABELS } from "@/lib/sail-abi";
import {
  discoverAgent,
  fetchSealedBlob,
  getAgentCommitments,
  receiveAxlMessages,
  sendAxlMessage,
  type DiscoveredAgent,
} from "@/lib/sail-api";
import {
  SEAL_AX_TOPIC,
  buildAuditRequestMessage,
  parseAuditResponseMessage,
} from "@/lib/audit-message";
import { useBackendStatus } from "@/lib/hooks/useBackendStatus";
import { expectedChain, sailContractAddress } from "@/lib/wagmi-config";
import { IntegrationStatusCards } from "@/components/dashboard/IntegrationStatusCards";
import { TxLink } from "@/components/ui/TxLink";

export type AuditorWorkspaceTab = "lookup" | "request" | "audit" | "slash";

function shortPeer(peerId: string) {
  return peerId.length > 24 ? `${peerId.slice(0, 14)}…${peerId.slice(-8)}` : peerId;
}

type FormalOutbound = {
  requestId: string;
  agentEns: string;
  operatorPeer: string;
  sentAt: number;
  outcome?: "accepted" | "denied";
};

type AgentLedgerCommitment = {
  txHash: string;
  blockNumber: string;
  logIndex: string;
  commitmentHash: string;
  cid: string;
  nonce: string;
  inputHash: string;
  timestamp: string;
  executed: boolean;
};

type LookupAgent = {
  wallet: string;
  stake: string;
  tier: number;
  active: boolean;
  auditors: string[];
  commitmentCount: string;
  slashCount: string;
};

type AuditResult = {
  expectedHash: string;
  wireHash: string;
  sealedPayload: string;
  note: string;
};

export function SailAuditorPanel() {
  const [tab, setTab] = useState<AuditorWorkspaceTab>("lookup");
  const { isConnected, chain, address } = useAccount();
  const backend = useBackendStatus();

  const [lookupEns, setLookupEns] = useState("");
  const [lookupAgent, setLookupAgent] = useState<LookupAgent | null>(null);
  const [onChainEnsKey, setOnChainEnsKey] = useState<string | null>(null);
  const [agentCommitments, setAgentCommitments] = useState<AgentLedgerCommitment[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [auditCid, setAuditCid] = useState("");
  const [auditExpectedHash, setAuditExpectedHash] = useState("");
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [requestEns, setRequestEns] = useState("");
  const [requestDiscover, setRequestDiscover] = useState<DiscoveredAgent | null>(null);
  const [requestDiscoverBusy, setRequestDiscoverBusy] = useState(false);
  const [requestDiscoverError, setRequestDiscoverError] = useState<string | null>(null);
  const [requestSendBusy, setRequestSendBusy] = useState(false);
  const [requestSendError, setRequestSendError] = useState<string | null>(null);
  const [formalOutbound, setFormalOutbound] = useState<FormalOutbound[]>([]);

  const [slashEns, setSlashEns] = useState("");
  const {
    writeContract,
    data: slashTxHash,
    isPending: slashPending,
    error: slashError,
  } = useWriteContract();
  const { isSuccess: slashConfirmed, isLoading: slashConfirming } =
    useWaitForTransactionReceipt({ hash: slashTxHash });

  function shortHash(h: string) {
    if (h.length <= 18) return h;
    return `${h.slice(0, 10)}…${h.slice(-8)}`;
  }

  async function handleLookup() {
    setLookupBusy(true);
    setLookupError(null);
    setLookupAgent(null);
    setOnChainEnsKey(null);
    setAgentCommitments([]);

    try {
      const ens = lookupEns.trim();
      if (!ens) throw new Error("Enter agent ENS (e.g. myagent.sail.eth)");
      const result = await getAgentCommitments(ens);
      setLookupAgent(result.agent);
      setAgentCommitments(result.commitments);
      setSlashEns(result.resolvedEns);
      setOnChainEnsKey(result.resolvedEns !== ens ? result.resolvedEns : null);
    } catch (error) {
      setLookupError((error as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }

  function openAuditForRow(row: AgentLedgerCommitment) {
    if (!row.cid?.trim()) return;
    setAuditCid(row.cid.trim());
    setAuditExpectedHash(row.commitmentHash);
    setTab("audit");
  }

  async function handleRequestDiscover() {
    setRequestDiscoverBusy(true);
    setRequestDiscoverError(null);
    setRequestDiscover(null);

    try {
      if (!requestEns.trim()) throw new Error("Agent ENS required");
      const d = await discoverAgent(requestEns.trim());
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
      if (!peer) throw new Error("Discover the agent first and ensure axl_peer_id is present.");
      const ens = requestEns.trim();
      if (!ens) throw new Error("Agent ENS required");

      const requestId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const message = buildAuditRequestMessage(requestId, ens, address);
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
        },
        ...prev,
      ]);
    } catch (error) {
      setRequestSendError((error as Error).message);
    } finally {
      setRequestSendBusy(false);
    }
  }

  useEffect(() => {
    if (tab !== "request") return;
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
  }, [tab, backend.status]);

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

  const tabCls = (value: AuditorWorkspaceTab) =>
    `rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
      tab === value
        ? "bg-[#05058a] text-white shadow-sm"
        : "border border-[#05058a]/20 bg-white text-[#05058a]/80 hover:border-[#05058a]/45 hover:text-[#05058a]"
    }`;

  return (
    <div className="space-y-0 text-sm">
      <div className="space-y-3 border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <IntegrationStatusCards backend={backend} variant="compact" />
          <nav className="flex shrink-0 flex-wrap items-center justify-end gap-2" aria-label="Auditor steps">
            <button type="button" className={tabCls("lookup")} onClick={() => setTab("lookup")}>
              Lookup
            </button>
            <button type="button" className={tabCls("request")} onClick={() => setTab("request")}>
              Request
            </button>
            <button type="button" className={tabCls("audit")} onClick={() => setTab("audit")}>
              Audit
            </button>
            <button type="button" className={tabCls("slash")} onClick={() => setTab("slash")}>
              Slash
            </button>
          </nav>
        </div>
        {chainMismatch ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Wallet is on {chain?.name ?? "another chain"}. Switch to {expectedChain.name} before any slash transaction.
          </p>
        ) : null}
      </div>

      <div className="pt-5">
        <main className="min-w-0">
          {tab === "lookup" && (
            <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Enter an agent ENS to load every on-chain <strong className="font-medium text-neutral-700">commit</strong> transaction for
              that agent. Each row is one anchored commitment you can open in Audit to fetch the sealed 0G blob.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="w-full min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="Agent ENS (e.g. myagent.sail.eth)"
                value={lookupEns}
                onChange={(event) => setLookupEns(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void handleLookup()}
              />
              <button
                type="button"
                onClick={() => void handleLookup()}
                disabled={lookupBusy || backend.status !== "online"}
                className="shrink-0 rounded bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
              >
                {lookupBusy ? "Loading…" : "Load commits"}
              </button>
            </div>

            {lookupError ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {lookupError}
              </p>
            ) : null}

            {lookupAgent ? (
              <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
                <p className="font-medium text-[#05058a]">Agent on-chain</p>
                {onChainEnsKey ? (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Registry key (normalized): <span className="font-mono text-neutral-700">{onChainEnsKey}</span>
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-neutral-600">
                  <span>
                    Status:{" "}
                    <span className={lookupAgent.active ? "text-emerald-700" : "text-red-700"}>
                      {lookupAgent.active ? "active" : "inactive"}
                    </span>
                  </span>
                  <span>
                    Tier:{" "}
                    {lookupAgent.tier >= 0 && lookupAgent.tier <= 2
                      ? TIER_LABELS[lookupAgent.tier as 0 | 1 | 2]
                      : lookupAgent.tier}
                  </span>
                  <span>Commitments: {lookupAgent.commitmentCount}</span>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {lookupAgent.wallet.slice(0, 10)}…{lookupAgent.wallet.slice(-6)}
                  </span>
                </div>
                {!lookupAgent.active ? (
                  <p className="mt-2 text-amber-800">This agent is inactive or slashed — review history before any slash action.</p>
                ) : null}
              </div>
            ) : null}

            {agentCommitments.length ? (
              <div className="overflow-x-auto rounded border border-neutral-200">
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-white">
                      <th className="px-2 py-2 font-semibold text-neutral-600">Block</th>
                      <th className="px-2 py-2 font-semibold text-neutral-600">Commit tx</th>
                      <th className="px-2 py-2 font-semibold text-neutral-600">Commitment</th>
                      <th className="px-2 py-2 font-semibold text-neutral-600">Execute gate</th>
                      <th className="px-2 py-2 font-semibold text-neutral-600">Posted</th>
                      <th className="px-2 py-2 font-semibold text-neutral-600">Audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentCommitments.map((row) => (
                      <tr key={`${row.txHash}-${row.logIndex}`} className="border-b border-neutral-100 bg-white last:border-b-0">
                        <td className="px-2 py-2 font-mono text-[11px] text-neutral-700">{row.blockNumber}</td>
                        <td className="px-2 py-2">
                          <TxLink hash={row.txHash} />
                        </td>
                        <td className="px-2 py-2 font-mono text-[10px] text-neutral-700" title={row.commitmentHash}>
                          {shortHash(row.commitmentHash)}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={
                              row.executed
                                ? "text-emerald-700"
                                : "rounded bg-amber-50 px-1.5 py-0.5 text-amber-800"
                            }
                          >
                            {row.executed ? "cleared" : "pending"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-neutral-600">
                          {new Date(Number(row.timestamp) * 1000).toLocaleString()}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => openAuditForRow(row)}
                            disabled={!row.cid?.trim()}
                            className="rounded border border-[#05058a] px-2 py-1 text-[11px] text-[#05058a] hover:bg-[#05058a]/5 disabled:opacity-40"
                          >
                            Audit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : lookupAgent && !lookupBusy ? (
              <p className="text-xs text-neutral-500">No CommitmentPosted events found for this ENS yet.</p>
            ) : null}
            </div>
          )}

          {tab === "request" && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                Send a formal <strong className="font-medium text-neutral-700">SEAL — Audit request</strong> to the operator’s AXL peer (from ENS text record{" "}
                <code className="rounded bg-neutral-100 px-1 font-mono text-[11px]">axl_peer_id</code>
                ). The operator can Accept or Deny over the same channel (topic <code className="rounded bg-neutral-100 px-1 font-mono text-[11px]">{SEAL_AX_TOPIC}</code>
                ). This does not replace on-chain authorization — it coordinates disclosure only.
              </p>

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

              <button
                type="button"
                onClick={() => void handleSendFormalAuditRequest()}
                disabled={
                  requestSendBusy ||
                  backend.status !== "online" ||
                  !requestDiscover?.records?.axl_peer_id?.trim() ||
                  !requestEns.trim()
                }
                className="rounded bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
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
                        <p className="mt-1 break-all font-mono text-[10px] text-neutral-400">id: {row.requestId}</p>
                        <p className="text-[10px] text-neutral-500">To peer: {shortPeer(row.operatorPeer)}</p>
                      </li>
                    ))}
                  </ul>
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
        </main>
      </div>
    </div>
  );
}
