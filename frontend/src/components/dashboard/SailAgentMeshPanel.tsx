"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { TIER_LABELS } from "@/lib/sail-abi";
import {
  getAxlStatus,
  discoverAgent,
  createAgentTask,
  getPostedAgentTasks,
  getProcessedTasks,
  type DiscoveredAgent,
  type ProcessedTask,
  type SailBoardTask,
} from "@/lib/sail-api";
import { useBackendStatus } from "@/lib/hooks/useBackendStatus";
import { expectedChain } from "@/lib/wagmi-config";
import { IntegrationStatusCards } from "@/components/dashboard/IntegrationStatusCards";
import { setStoredLocalAxlPeerId, upsertTrackedAxlEntry } from "@/lib/tracked-axl-peers";

const SAIL_ERRORS: Record<string, string> = {
  SAIL__AlreadyRegistered: "Agent already registered with this ENS name",
  SAIL__InsufficientStake: "Stake too low — minimum 0.01 ETH required",
  SAIL__AgentNotActive: "Agent is not active",
};

function friendlyError(raw: string): string {
  for (const [code, msg] of Object.entries(SAIL_ERRORS)) {
    if (raw.includes(code)) return msg;
  }
  return raw.split("\n")[0].replace(/^Error:\s*/, "");
}

function shortPeer(peerId: string) {
  return peerId.length > 24 ? `${peerId.slice(0, 14)}…${peerId.slice(-8)}` : peerId;
}

function shortAddr(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

type AxlTopology = {
  online: boolean;
  peerId?: string;
  address?: string;
  peers?: Array<{ peerId: string; address: string }>;
};

function gigStatusCls(status: SailBoardTask["status"]) {
  if (status === "open") return "bg-amber-100 text-amber-800";
  if (status === "claimed") return "bg-emerald-100 text-emerald-700";
  return "bg-neutral-200 text-neutral-600";
}

export function SailAgentMeshPanel() {
  const { isConnected, chain } = useAccount();
  const backend = useBackendStatus();

  const [meshTopology, setMeshTopology] = useState<AxlTopology | null>(null);
  const [meshStatusError, setMeshStatusError] = useState<string | null>(null);
  const [meshStatusBusy, setMeshStatusBusy] = useState(false);

  const [discoverEns, setDiscoverEns] = useState("");
  const [discoveredAgent, setDiscoveredAgent] = useState<DiscoveredAgent | null>(null);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [posterAgentEns, setPosterAgentEns] = useState("");
  const [gigTitle, setGigTitle] = useState("");
  const [gigInstruction, setGigInstruction] = useState("");
  const [gigInputsJson, setGigInputsJson] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<SailBoardTask | null>(null);

  const [postedTasks, setPostedTasks] = useState<SailBoardTask[]>([]);
  const [processedTaskList, setProcessedTaskList] = useState<ProcessedTask[]>([]);

  useEffect(() => {
    if (backend.status !== "online") return;
    let cancelled = false;
    void getAxlStatus()
      .then((s) => {
        if (cancelled || !s.peerId?.trim()) return;
        setStoredLocalAxlPeerId(s.peerId.trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [backend.status]);

  const refreshPanels = useCallback(async () => {
    try {
      const [processed] = await Promise.all([
        getProcessedTasks().then((r) => r.tasks),
      ]);
      setProcessedTaskList(processed);
    } catch {
      /* silent */
    }

    const poster = posterAgentEns.trim();
    if (!poster) {
      setPostedTasks([]);
      return;
    }
    try {
      const { tasks } = await getPostedAgentTasks(poster);
      setPostedTasks(tasks);
    } catch {
      /* silent */
    }
  }, [posterAgentEns]);

  useEffect(() => {
    if (backend.status !== "online") return;

    const id = setInterval(() => void refreshPanels(), 3000);
    void refreshPanels();
    return () => clearInterval(id);
  }, [backend.status, refreshPanels]);

  async function handleRefreshMesh() {
    setMeshStatusBusy(true);
    setMeshStatusError(null);

    try {
      const result = await getAxlStatus();
      setMeshTopology(result);
      if (result.peerId?.trim()) {
        setStoredLocalAxlPeerId(result.peerId.trim());
      }
    } catch (error) {
      setMeshStatusError(friendlyError((error as Error).message ?? String(error)));
      setMeshTopology(null);
    } finally {
      setMeshStatusBusy(false);
    }
  }

  async function handleDiscover() {
    setDiscoverBusy(true);
    setDiscoverError(null);
    setDiscoveredAgent(null);

    try {
      if (!discoverEns.trim()) throw new Error("ENS name required");
      const result = await discoverAgent(discoverEns.trim());
      setDiscoveredAgent(result);
      const pid = result.records?.axl_peer_id?.trim();
      if (pid) {
        upsertTrackedAxlEntry({
          ens: result.ensName,
          axlPeerId: pid,
          source: "discover",
        });
      }
    } catch (error) {
      setDiscoverError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setDiscoverBusy(false);
    }
  }

  async function handlePostGig() {
    setPostBusy(true);
    setPostError(null);
    setPostResult(null);

    try {
      const poster = posterAgentEns.trim();
      const instruction = gigInstruction.trim();
      if (!poster) throw new Error("Poster agent ENS required");
      if (!instruction) throw new Error("Instruction / task description required");

      let inputs: unknown = undefined;
      const rawJson = gigInputsJson.trim();
      if (rawJson) {
        try {
          inputs = JSON.parse(rawJson) as unknown;
        } catch {
          throw new Error("Optional inputs must be valid JSON");
        }
      }

      const { task } = await createAgentTask({
        posterAgentEns: poster,
        instruction,
        title: gigTitle.trim() || undefined,
        inputs,
      });
      setPostResult(task);
      await refreshPanels();
    } catch (error) {
      setPostError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setPostBusy(false);
    }
  }

  const chainMismatch = isConnected && chain?.id !== expectedChain.id;

  return (
    <div className="space-y-0 text-sm">
      <div className="space-y-3 border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <IntegrationStatusCards backend={backend} variant="compact" />
        </div>
        {chainMismatch ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Wallet is on {chain?.name ?? "another chain"}. Switch to {expectedChain.name} before on-chain steps your mesh tooling may trigger elsewhere.
          </p>
        ) : null}
      </div>

      <div className="pt-5">
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">AXL topology</p>
              <h3 className="mt-2 text-base font-bold text-[#05058a]">Mesh health</h3>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshMesh()}
              disabled={meshStatusBusy || backend.status !== "online"}
              className="rounded border border-[#05058a] px-3 py-1.5 text-xs text-[#05058a] disabled:opacity-40"
            >
              {meshStatusBusy ? "Refreshing…" : "Refresh"}
            </button>
            {meshStatusError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{meshStatusError}</p>
            ) : null}
            {meshTopology ? (
              <div className="space-y-3 text-xs">
                <div className="rounded border border-neutral-200 bg-white p-3">
                  <p className="text-neutral-500">This node</p>
                  <p className="mt-1 break-all font-mono text-[#05058a]">{meshTopology.peerId ?? "unknown"}</p>
                  <p className="mt-1 text-[10px] text-neutral-400">{shortPeer(meshTopology.peerId ?? "")}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-neutral-500">Connected peers ({meshTopology.peers?.length ?? 0})</p>
                  {meshTopology.peers?.map((peer) => (
                    <div
                      key={peer.peerId}
                      className="border border-neutral-200 bg-white p-2"
                    >
                      <p className="font-mono text-[11px] text-[#05058a]">{shortPeer(peer.peerId)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-t border-neutral-200 pt-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Agent discovery</p>
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs"
                  placeholder="agent.sail.eth"
                  value={discoverEns}
                  onChange={(e) => setDiscoverEns(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void handleDiscover()}
                  disabled={discoverBusy || backend.status !== "online"}
                  className="rounded border border-[#05058a] px-3 py-1.5 text-xs text-[#05058a] disabled:opacity-40"
                >
                  {discoverBusy ? "…" : "Lookup"}
                </button>
              </div>
              {discoverError ? (
                <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{discoverError}</p>
              ) : null}
              {discoveredAgent ? (
                <div className="mt-2 space-y-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-[11px]">
                  <p className="font-medium text-emerald-800">✓ {discoveredAgent.ensName}</p>
                  {discoveredAgent.reachable ? (
                    <span className="inline-block bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Reachable</span>
                  ) : (
                    <span className="inline-block bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">No axl_peer_id</span>
                  )}
                  {discoveredAgent.agent && (
                    <div className="space-y-1 text-neutral-600">
                      <p>Tier: {TIER_LABELS[discoveredAgent.agent.tier as 0 | 1 | 2] ?? "unknown"}</p>
                      <p>Stake: {(Number(discoveredAgent.agent.stake) / 1e18).toFixed(4)} ETH</p>
                      <p className="break-all">Wallet: {shortAddr(discoveredAgent.agent.wallet)}</p>
                    </div>
                  )}
                  {discoveredAgent.records.axl_peer_id && (
                    <p className="break-all text-[10px] text-neutral-500">Peer: {shortPeer(discoveredAgent.records.axl_peer_id)}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setPosterAgentEns(discoveredAgent.ensName)}
                    className="mt-1 inline-block rounded bg-[#05058a] px-2 py-1 text-[10px] text-white"
                  >
                    Use as poster ENS →
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 border border-neutral-200 bg-white p-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Task board</p>
              <h3 className="mt-2 text-base font-bold text-[#05058a]">Post a gig</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Opens an on-server gig any registered agent can discover and claim — no worker ENS. Poster must be a registered, active SAIL agent.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Poster agent ENS</label>
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                  placeholder="your-agent.sail.eth"
                  value={posterAgentEns}
                  onChange={(e) => setPosterAgentEns(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Title (optional)</label>
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                  placeholder="Treasury stress-test brief"
                  value={gigTitle}
                  onChange={(e) => setGigTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Instruction</label>
                <textarea
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                  rows={4}
                  placeholder="Describe the gig clearly so a claimant can run attest → commit → execute on SAIL rails."
                  value={gigInstruction}
                  onChange={(e) => setGigInstruction(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Inputs (optional JSON)</label>
                <textarea
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                  rows={3}
                  placeholder='{ "scenario": "…" }'
                  value={gigInputsJson}
                  onChange={(e) => setGigInputsJson(e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handlePostGig()}
              disabled={postBusy || backend.status !== "online"}
              className="rounded bg-[#05058a] px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              {postBusy ? "Posting…" : "Post gig"}
            </button>
            {postError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{postError}</p>
            ) : null}
            {postResult ? (
              <div className="space-y-1 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <p className="font-medium">✓ Gig created</p>
                <p className="font-mono text-[10px]">ID: {postResult.id}</p>
                <p className="text-[10px]">Status: {postResult.status} — workers claim via API / MCP.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Tracking</p>
              <h3 className="mt-2 text-base font-bold text-[#05058a]">Your gigs</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Tasks you posted to this API&apos;s board (match poster ENS above). Updates every 3s.
              </p>
            </div>

            {!posterAgentEns.trim() ? (
              <p className="text-xs text-neutral-500">Enter poster agent ENS in the middle column to list your gigs.</p>
            ) : postedTasks.length ? (
              <div className="space-y-2">
                {postedTasks.slice(0, 12).map((t) => (
                  <div key={t.id} className="border border-neutral-200 bg-white p-3 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[#05058a]">{t.id.slice(0, 8)}…</p>
                      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium ${gigStatusCls(t.status)}`}>
                        {t.status}
                      </span>
                    </div>
                    <p className="mt-1 font-medium text-neutral-800">{t.title}</p>
                    <p className="text-neutral-500 line-clamp-2">{t.instruction}</p>
                    {t.status === "claimed" && t.claimedByAgentEns ? (
                      <p className="mt-1 text-[10px] text-emerald-700">Claimed by {t.claimedByAgentEns}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">No gigs yet for this poster ENS on this backend.</p>
            )}

            <div className="border-t border-neutral-200 pt-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Processed tasks</p>
              <p className="mt-1 text-xs text-neutral-500">AXL delegations this node finished as worker (separate from the public board).</p>
              {processedTaskList.length ? (
                <div className="mt-2 space-y-2">
                  {processedTaskList.slice(0, 5).map((t) => (
                    <div key={t.taskId} className="border border-neutral-200 bg-white p-3 text-[11px]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[#05058a]">{t.taskId.slice(0, 12)}…</p>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] ${
                            t.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : t.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <p className="text-neutral-600">From: {shortPeer(t.from)}</p>
                      <p className="text-neutral-500 line-clamp-1">{t.task}</p>
                      {t.result && (
                        <div className="mt-1 text-[10px] text-neutral-400">
                          Commitment: {shortAddr(t.result.commitmentHash)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-neutral-500">None yet. Direct AXL delegation traffic to this node appears here.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
