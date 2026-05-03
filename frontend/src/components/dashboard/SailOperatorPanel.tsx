"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { TIER_LABELS, tierEnsSlug } from "@/lib/sail-abi";
import {
  attestInputs,
  commitToSail,
  executeCommitment,
  getAgent,
  getAxlStatus,
  getComputeProviders,
  getComputeLedger,
  ownsEnsName,
  receiveAxlMessages,
  reason,
  type RecvPollStats,
  registerAgent,
  registerEnsSubname,
  sendAxlMessage,
  discoverAgent,
  delegateTask,
  getDelegations,
  getProcessedTasks,
  startTaskRouter,
  stopTaskRouter,
  type CommitResponse,
  type ComputeProvider,
  type LedgerInfo,
  type DiscoveredAgent,
  type DelegationRecord,
  type ProcessedTask,
} from "@/lib/sail-api";
import { useBackendStatus } from "@/lib/hooks/useBackendStatus";
import { expectedChain, sailApiLabel } from "@/lib/wagmi-config";
import { IntegrationStatusCards } from "@/components/dashboard/IntegrationStatusCards";
import { TxLink } from "@/components/ui/TxLink";
import {
  SEAL_AX_TOPIC,
  buildAcceptMessage,
  buildDenyMessage,
  parseAuditRequestMessage,
  type ParsedAuditRequest,
} from "@/lib/audit-message";
import {
  getStoredLocalAxlPeerId,
  loadTrackedAxlEntries,
  peerIdsMatch,
  removeTrackedAxlEntry,
  setStoredLocalAxlPeerId,
  upsertTrackedAxlEntry,
  type TrackedAxlEntry,
} from "@/lib/tracked-axl-peers";

const SAIL_ERRORS: Record<string, string> = {
  SAIL__AlreadyRegistered:    "Agent already registered with this ENS name",
  SAIL__InsufficientStake:    "Stake too low — minimum 0.01 ETH required",
  SAIL__AgentNotActive:       "Agent is not active",
  SAIL__CommitmentNotFound:   "Commitment not found",
  SAIL__AlreadyExecuted:      "Commitment already executed",
  SAIL__NonceMismatch:        "Nonce mismatch — replay detected",
  SAIL__NotAuthorizedAuditor: "Not an authorized auditor for this agent",
  SAIL__CommitmentAlreadyExists: "Commitment hash already exists",
  SAIL__TransferFailed:       "ETH transfer failed",
  SAIL__NotAgentOperator:     "Caller is not the agent operator",
  SAIL__NoAuditors:           "No auditors set for this agent",
  SAIL__NotOwner:             "Not the contract owner",
};

function friendlyError(raw: string): string {
  for (const [code, msg] of Object.entries(SAIL_ERRORS)) {
    if (raw.includes(code)) return msg;
  }
  // Return just the first line so we never dump the full ABI call
  return raw.split("\n")[0].replace(/^Error:\s*/, "");
}

/** JSON-RPC -32602 style messages often come from the backend’s Sepolia provider during estimateGas/send — not from your inputs JSON. */
function augmentRpcError(stage: string, raw: string): string {
  const m = friendlyError(raw);
  let out = `${stage}: ${m}`;
  if (/missing or invalid parameter/i.test(m)) {
    out += `\n\nUsually the operator wallet’s RPC (commit/execute on the API server) rejected the eth_estimateGas / send request — check SEPOLIA RPC URL & key on the backend you’re calling. Frontend API target: ${sailApiLabel}. For local backend use NEXT_PUBLIC_SAIL_API_URL=http://localhost:3001 (restart dev server).`;
  }
  return out;
}

/** Top-level workspaces in flow order: register → pipeline → manage → reveal → mesh. */
type PrimaryWorkspace = "register" | "pipeline" | "manage" | "reveal" | "mesh";

type AxlInboxMessage = {
  from: string;
  message: string;
  topic?: string;
  timestamp: number;
};

/** Matches wire formats in `src/lib/audit-message.ts` — auditor ↔ operator SEAL traffic over AXL. */
function isRevealInboxMessage(body: string, topic?: string): boolean {
  if (topic === SEAL_AX_TOPIC) return true;
  const t = body.replace(/^\uFEFF/, "").trim();
  return (
    t.startsWith("SEAL — Submit audit reveal") ||
    t.startsWith("SEAL — Audit request") ||
    t.startsWith("SEAL deny audit request") ||
    t.startsWith("SEAL — Audit deny") ||
    t.startsWith("SEAL — Audit accept")
  );
}

function mergeRevealInbox(prev: AxlInboxMessage[], batch: AxlInboxMessage[]): AxlInboxMessage[] {
  const key = (m: AxlInboxMessage) => `${m.timestamp}\0${m.from}\0${m.message}`;
  const seen = new Set(prev.map(key));
  const out = [...prev];
  for (const m of batch) {
    const k = key(m);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m);
    }
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

function trackedEnsForSender(peerId: string, entries: TrackedAxlEntry[]): string | undefined {
  for (const e of entries) {
    if (peerIdsMatch(e.axlPeerId, peerId)) return e.ens;
  }
  return undefined;
}

function neuronToA0gi(neuron: string): string {
  try {
    const n = BigInt(neuron);
    const ONE = BigInt("1000000000000000000");
    const ZERO = BigInt(0);
    const whole = n / ONE;
    const frac = n % ONE;
    if (frac === ZERO) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole}.${fracStr.slice(0, 4)}`;
  } catch {
    return neuron;
  }
}

function shortAddr(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

type AgentInfo = {
  wallet: string;
  stake: string;
  tier: number;
  active: boolean;
  auditors: string[];
  commitmentCount: string;
  slashCount: string;
  nonce: string;
};

type PipelineResult = {
  inputHash?: string;
  reasoning?: { output: string; model: string; attestation?: string; verified?: boolean | null; providerAddress?: string };
  commit?: CommitResponse;
  executeTxHash?: string;
};

type AxlTopology = {
  online: boolean;
  peerId?: string;
  address?: string;
  peers?: Array<{ peerId: string; address: string }>;
};

const PIPELINE_EXAMPLES = [
  {
    label: "Treasury rebalance",
    value: JSON.stringify(
      {
        task: "rebalance treasury",
        holdings: { ETH: 42, USDC: 250000 },
        market: { pair: "ETH/USD", price: 3200 },
        policy: "keep 40% stablecoin exposure",
      },
      null,
      2,
    ),
  },
  {
    label: "DAO vote execution",
    value: JSON.stringify(
      {
        task: "execute DAO proposal",
        proposalId: "42",
        action: "release milestone payment",
        recipient: "0x1234...beef",
      },
      null,
      2,
    ),
  },
];

function shortPeer(peerId: string) {
  return peerId.length > 24 ? `${peerId.slice(0, 14)}…${peerId.slice(-8)}` : peerId;
}

export function SailOperatorPanel() {
  const { address, isConnected, chain } = useAccount();
  /** Tracks the wallet address we last prefilled so switching accounts can refresh the default. */
  const auditorsWalletPrefillRef = useRef<string | null>(null);
  const backend = useBackendStatus();

  const [primary, setPrimary] = useState<PrimaryWorkspace>("register");

  const [computeProviders, setComputeProviders] = useState<ComputeProvider[]>([]);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [computeLedger, setComputeLedger] = useState<LedgerInfo | null>(null);

  const [regEns, setRegEns] = useState("");
  const [regTier, setRegTier] = useState<0 | 1>(0);
  const [regAuditors, setRegAuditors] = useState("");
  const [regStake, setRegStake] = useState("0.01");
  const [regBusy, setRegBusy] = useState(false);
  const [regResult, setRegResult] = useState<{
    txHash: string;
    ens: string;
    ensSubname?: { txHashes: string[]; pendingRecords?: boolean };
    ensError?: string;
  } | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  const [pipeEns, setPipeEns] = useState("");
  const [pipeInputs, setPipeInputs] = useState("");
  const [pipeSealedInference, setPipeSealedInference] = useState(false);
  const [pipeSysPrompt, setPipeSysPrompt] = useState(
    "You are a treasury manager. Reply with a single concise decision.",
  );
  const [pipeBusy, setPipeBusy] = useState(false);
  const [pipeStatus, setPipeStatus] = useState("");
  const [pipeError, setPipeError] = useState<string | null>(null);
  const [pipeResult, setPipeResult] = useState<PipelineResult>({});

  const [monEns, setMonEns] = useState("");
  const [monAgent, setMonAgent] = useState<AgentInfo | null>(null);
  const [monError, setMonError] = useState<string | null>(null);

  const [identityParent, setIdentityParent] = useState(
    process.env.NEXT_PUBLIC_ENS_PARENT_NAME ?? "sail.eth",
  );
  const [identityLabel, setIdentityLabel] = useState("");
  const [identityCapabilities, setIdentityCapabilities] = useState(
    "commit,execute,audit,delegate",
  );
  const [identityAxlPeerId, setIdentityAxlPeerId] = useState("");
  const [identityOwnsBusy, setIdentityOwnsBusy] = useState(false);
  const [identityOwns, setIdentityOwns] = useState<boolean | null>(null);
  const [identityOwnsError, setIdentityOwnsError] = useState<string | null>(null);
  const [identityRegisterBusy, setIdentityRegisterBusy] = useState(false);
  const [identityRegisterError, setIdentityRegisterError] = useState<string | null>(null);
  const [identityRegisterResult, setIdentityRegisterResult] = useState<{
    ensName: string;
    txHashes: string[];
    pendingRecords?: boolean;
  } | null>(null);

  const [meshTopology, setMeshTopology] = useState<AxlTopology | null>(null);
  const [meshStatusError, setMeshStatusError] = useState<string | null>(null);
  const [meshStatusBusy, setMeshStatusBusy] = useState(false);
  const [meshSendTo, setMeshSendTo] = useState("");
  const [meshTopic, setMeshTopic] = useState("sail.test");
  const [meshMessage, setMeshMessage] = useState(() =>
    JSON.stringify({ type: "ping", at: "replace-me", note: "SAIL operator console" }, null, 2),
  );
  const [meshSendBusy, setMeshSendBusy] = useState(false);
  const [meshSendError, setMeshSendError] = useState<string | null>(null);
  const [meshSendResult, setMeshSendResult] = useState<string | null>(null);
  const [meshInboxBusy, setMeshInboxBusy] = useState(false);
  const [meshInboxError, setMeshInboxError] = useState<string | null>(null);
  const [meshInbox, setMeshInbox] = useState<
    Array<{ from: string; message: string; topic?: string; timestamp: number }>
  >([]);

  const [revealInbox, setRevealInbox] = useState<AxlInboxMessage[]>([]);
  const [revealInboxBusy, setRevealInboxBusy] = useState(false);
  const [revealInboxError, setRevealInboxError] = useState<string | null>(null);
  const [answeredAuditRequests, setAnsweredAuditRequests] = useState<Record<string, "accept" | "deny">>({});
  const [auditRespondBusy, setAuditRespondBusy] = useState(false);
  const [auditRespondError, setAuditRespondError] = useState<string | null>(null);

  /** LocalStorage — ENS ↔ axl_peer_id we registered/discovered; local node id from mesh/status. */
  const [trackedAxlEntries, setTrackedAxlEntries] = useState<TrackedAxlEntry[]>([]);
  const [localAxlPeerStored, setLocalAxlPeerStored] = useState<string | null>(null);
  const [manualTrackEns, setManualTrackEns] = useState("");
  const [manualTrackPeer, setManualTrackPeer] = useState("");
  const [revealLastPollAt, setRevealLastPollAt] = useState<number | null>(null);
  const [recvPollStats, setRecvPollStats] = useState<RecvPollStats | null>(null);

  // --- Agent-to-agent communication state ---
  const [discoverEns, setDiscoverEns] = useState("");
  const [discoveredAgent, setDiscoveredAgent] = useState<DiscoveredAgent | null>(null);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [delegateWorker, setDelegateWorker] = useState("");
  const [delegateTask_, setDelegateTask_] = useState("");
  const [delegateAgentEns, setDelegateAgentEns] = useState("");
  const [delegateBusy, setDelegateBusy] = useState(false);
  const [delegateError, setDelegateError] = useState<string | null>(null);
  const [delegateResult, setDelegateResult] = useState<DelegationRecord | null>(null);

  const [delegationList, setDelegationList] = useState<DelegationRecord[]>([]);
  const [processedTaskList, setProcessedTaskList] = useState<ProcessedTask[]>([]);

  useEffect(() => {
    if (backend.status !== "online") {
      return;
    }

    let cancelled = false;

    getComputeProviders()
      .then((result) => {
        if (!cancelled) {
          setComputeProviders(result.providers);
          setComputeError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setComputeProviders([]);
          setComputeError(friendlyError((error as Error).message ?? String(error)));
        }
      });

    getComputeLedger()
      .then((result) => {
        if (!cancelled) setComputeLedger(result.ledger);
      })
      .catch(() => {
        if (!cancelled) setComputeLedger(null);
      });

    return () => {
      cancelled = true;
    };
  }, [backend.status]);

  useEffect(() => {
    setTrackedAxlEntries(loadTrackedAxlEntries());
    setLocalAxlPeerStored(getStoredLocalAxlPeerId());
  }, []);

  useEffect(() => {
    if (backend.status !== "online") return;
    let cancelled = false;
    void getAxlStatus()
      .then((s) => {
        if (cancelled || !s.peerId?.trim()) return;
        setStoredLocalAxlPeerId(s.peerId.trim());
        setLocalAxlPeerStored(s.peerId.trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [backend.status]);

  useEffect(() => {
    if (!address) return;
    setRegAuditors((prev) => {
      const trimmed = prev.trim();
      if (trimmed === "") return address;
      const last = auditorsWalletPrefillRef.current;
      if (
        last &&
        trimmed.toLowerCase() === last.toLowerCase()
      ) {
        return address;
      }
      return prev;
    });
    auditorsWalletPrefillRef.current = address;
  }, [address]);

  async function handleRegister() {
    setRegBusy(true);
    setRegError(null);
    setRegResult(null);

    try {
      if (!regEns.trim()) throw new Error("ENS name required");
      const parentName = process.env.NEXT_PUBLIC_ENS_PARENT_NAME ?? "sail.eth";
      const rawEns = regEns.trim();
      // Auto-append parent if user typed just a label (e.g. "swarnim" → "myagent.sail.eth")
      const fullEns = rawEns.includes(".") ? rawEns : `${rawEns}.${parentName}`;
      const auditors = regAuditors
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!auditors.length) throw new Error("At least one auditor address required");

      const result = await registerAgent({
        ens: fullEns,
        tier: regTier,
        auditors,
        stakeEth: regStake,
      });

      setRegEns(result.ens);
      setPipeEns(result.ens);
      setMonEns(result.ens);

      const [label, ...rest] = result.ens.split(".");
      if (rest.length > 1) {
        setIdentityLabel(label);
        setIdentityParent(rest.join("."));
      }

      // ENS subname creation is handled by the backend — use the result directly
      setRegResult({
        txHash: result.txHash,
        ens: result.ens,
        ensSubname: result.ensSubname ?? undefined,
      });
    } catch (error) {
      setRegError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setRegBusy(false);
    }
  }

  async function handlePipeline() {
    setPipeBusy(true);
    setPipeError(null);
    setPipeStatus("");
    setPipeResult({});

    try {
      if (!pipeEns.trim()) throw new Error("Agent ENS required");
      if (!pipeInputs.trim()) throw new Error("Inputs required");

      const result: PipelineResult = {};

      setPipeStatus("01 — attesting inputs");
      const attest = await attestInputs(pipeInputs);
      result.inputHash = attest.inputHash;
      setPipeResult({ ...result });

      let attestation: string | undefined;
      let decision = pipeInputs;

      if (pipeSealedInference) {
        setPipeStatus("02 — 0G Compute sealed inference");
        const reasoning = await reason(pipeInputs, pipeSysPrompt);
        decision = reasoning.output;
        attestation = reasoning.attestation;
        result.reasoning = {
          output: reasoning.output,
          model: reasoning.model,
          attestation: reasoning.attestation,
          verified: reasoning.verified,
          providerAddress: reasoning.providerAddress,
        };
        setPipeResult({ ...result });
      }

      setPipeStatus("03 — encrypting via Lit · uploading to 0G · anchoring on-chain");
      let commit: CommitResponse;
      try {
        commit = await commitToSail({
          agentEns: pipeEns.trim(),
          inputHash: result.inputHash!,
          decision,
          proposedAction: "0xPLACEHOLDER",
          attestation,
        });
      } catch (e) {
        throw new Error(
          augmentRpcError(
            "Step 03 (commit — Lit encrypt · 0G upload · on-chain commit)",
            (e as Error).message ?? String(e),
          ),
        );
      }
      result.commit = commit;
      setPipeResult({ ...result });

      setPipeStatus("04 — clearing execute gate");
      try {
        const execute = await executeCommitment(pipeEns.trim(), commit.commitmentHash);
        result.executeTxHash = execute.txHash;
      } catch (e) {
        throw new Error(
          augmentRpcError(
            "Step 04 (execute — on-chain execute gate)",
            (e as Error).message ?? String(e),
          ),
        );
      }
      setPipeResult({ ...result });

      setPipeStatus("done");
    } catch (error) {
      const raw = (error as Error).message ?? String(error);
      setPipeError(raw.includes("Step 0") ? raw : friendlyError(raw));
      setPipeStatus("");
    } finally {
      setPipeBusy(false);
    }
  }

  async function handleMonitorLookup() {
    setMonError(null);
    setMonAgent(null);

    try {
      if (!monEns.trim()) throw new Error("ENS name required");
      const result = await getAgent(monEns.trim());
      setMonAgent({
        wallet: result.agent.wallet,
        stake: result.agent.stake,
        tier: result.agent.tier,
        active: result.agent.active,
        auditors: result.agent.auditors,
        commitmentCount: result.agent.commitmentCount,
        slashCount: result.agent.slashCount,
        nonce: result.nonce,
      });
    } catch (error) {
      setMonError(friendlyError((error as Error).message ?? String(error)));
    }
  }

  async function handleCheckOwnership() {
    setIdentityOwnsBusy(true);
    setIdentityOwnsError(null);
    setIdentityOwns(null);

    try {
      if (!identityParent.trim()) throw new Error("Parent ENS name required");
      const result = await ownsEnsName(identityParent.trim());
      setIdentityOwns(result.owns);
    } catch (error) {
      setIdentityOwnsError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setIdentityOwnsBusy(false);
    }
  }

  async function handleRegisterSubname() {
    setIdentityRegisterBusy(true);
    setIdentityRegisterError(null);
    setIdentityRegisterResult(null);

    try {
      if (!identityParent.trim()) throw new Error("Parent ENS name required");
      if (!identityLabel.trim()) throw new Error("Subdomain label required");

      const result = await registerEnsSubname({
        parentName: identityParent.trim(),
        subLabel: identityLabel.trim(),
        records: {
          axl_peer_id: identityAxlPeerId.trim(),
          sail_tier: tierEnsSlug(regTier),
          sail_contract: backend.contract ?? "",
          capabilities: identityCapabilities.trim(),
          auditors: regAuditors.trim(),
        },
      });

      setIdentityRegisterResult(result);
      setMonEns(result.ensName);
      if (identityAxlPeerId.trim()) {
        setTrackedAxlEntries(
          upsertTrackedAxlEntry({
            ens: result.ensName,
            axlPeerId: identityAxlPeerId.trim(),
            source: "ens_subname",
          }),
        );
      }
    } catch (error) {
      setIdentityRegisterError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setIdentityRegisterBusy(false);
    }
  }

  function handleManualTrackPeer() {
    const ens = manualTrackEns.trim();
    const peer = manualTrackPeer.trim();
    if (!ens || !peer) return;
    setTrackedAxlEntries(upsertTrackedAxlEntry({ ens, axlPeerId: peer, source: "manual" }));
    setManualTrackEns("");
    setManualTrackPeer("");
  }

  async function handleRefreshMesh() {
    setMeshStatusBusy(true);
    setMeshStatusError(null);

    try {
      const result = await getAxlStatus();
      setMeshTopology(result);
      if (result.peerId?.trim()) {
        setStoredLocalAxlPeerId(result.peerId.trim());
        setLocalAxlPeerStored(result.peerId.trim());
      }
      if (result.peers?.length && !meshSendTo) {
        setMeshSendTo(result.peers[0].peerId);
      }
    } catch (error) {
      setMeshStatusError(friendlyError((error as Error).message ?? String(error)));
      setMeshTopology(null);
    } finally {
      setMeshStatusBusy(false);
    }
  }

  async function handleSendMeshMessage() {
    setMeshSendBusy(true);
    setMeshSendError(null);
    setMeshSendResult(null);

    try {
      if (!meshSendTo.trim()) throw new Error("Recipient peer ID required");
      if (!meshMessage.trim()) throw new Error("Message payload required");

      await sendAxlMessage({
        to: meshSendTo.trim(),
        topic: meshTopic.trim() || undefined,
        message: meshMessage,
      });
      setMeshSendResult("Message handed to the AXL bridge.");
    } catch (error) {
      setMeshSendError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setMeshSendBusy(false);
    }
  }

  async function handlePollInbox() {
    setMeshInboxBusy(true);
    setMeshInboxError(null);

    try {
      const since = meshInbox[0]?.timestamp;
      const result = await receiveAxlMessages(since);
      setMeshInbox(result.messages);
    } catch (error) {
      setMeshInboxError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setMeshInboxBusy(false);
    }
  }

  const handlePollRevealInbox = useCallback(async () => {
    setRevealInboxBusy(true);
    setRevealInboxError(null);
    try {
      const result = await receiveAxlMessages();
      setRecvPollStats(result.recvPoll ?? null);
      const filtered = result.messages.filter((m) => isRevealInboxMessage(m.message, m.topic));
      setRevealInbox((prev) => mergeRevealInbox(prev, filtered));
    } catch (error) {
      setRevealInboxError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setRevealLastPollAt(Date.now());
      setRevealInboxBusy(false);
    }
  }, []);

  async function handleFormalAuditResponse(
    fromPeer: string,
    parsed: ParsedAuditRequest,
    decision: "accept" | "deny",
  ) {
    setAuditRespondBusy(true);
    setAuditRespondError(null);
    try {
      const body =
        decision === "accept"
          ? buildAcceptMessage(parsed.requestId, parsed.agentEns)
          : buildDenyMessage(parsed.requestId, parsed.agentEns);
      await sendAxlMessage({
        to: fromPeer,
        topic: SEAL_AX_TOPIC,
        message: body,
      });
      setAnsweredAuditRequests((prev) => ({ ...prev, [parsed.requestId]: decision }));
    } catch (error) {
      setAuditRespondError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setAuditRespondBusy(false);
    }
  }

  const pendingFormalAuditRequests = useMemo(() => {
    const rows: Array<AxlInboxMessage & { parsed: ParsedAuditRequest }> = [];
    const seen = new Set<string>();
    for (const row of revealInbox) {
      const parsed = parseAuditRequestMessage(row.message);
      if (!parsed) continue;
      if (answeredAuditRequests[parsed.requestId]) continue;
      const dedupe = `${parsed.requestId}:${row.from}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({ ...row, parsed });
    }
    return rows.sort((a, b) => b.timestamp - a.timestamp);
  }, [revealInbox, answeredAuditRequests]);

  // --- Agent discovery ---
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
        setTrackedAxlEntries(
          upsertTrackedAxlEntry({
            ens: result.ensName,
            axlPeerId: pid,
            source: "discover",
          }),
        );
      }
    } catch (error) {
      setDiscoverError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setDiscoverBusy(false);
    }
  }

  // --- Delegation ---
  async function handleDelegate() {
    setDelegateBusy(true);
    setDelegateError(null);
    setDelegateResult(null);

    try {
      if (!delegateWorker.trim()) throw new Error("Worker ENS required");
      if (!delegateTask_.trim()) throw new Error("Task required");
      if (!delegateAgentEns.trim()) throw new Error("Agent ENS required");

      const result = await delegateTask({
        workerEns: delegateWorker.trim(),
        task: delegateTask_.trim(),
        agentEns: delegateAgentEns.trim(),
      });
      setDelegateResult(result);
      await refreshDelegations();
    } catch (error) {
      setDelegateError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setDelegateBusy(false);
    }
  }

  // --- Refresh delegation + processed task lists ---
  async function refreshDelegations() {
    try {
      const [d, t] = await Promise.all([getDelegations(), getProcessedTasks()]);
      setDelegationList(d.delegations);
      setProcessedTaskList(t.tasks);
    } catch {
      // silent — these are background refreshes
    }
  }

  // Auto-refresh delegations when Mesh is open
  useEffect(() => {
    if (primary !== "mesh") return;
    if (backend.status !== "online") return;

    const id = setInterval(() => refreshDelegations(), 3000);
    refreshDelegations();
    return () => clearInterval(id);
  }, [primary, backend.status]);

  // Poll AXL for auditor SEAL messages whenever the API is up — not only on the Reveal tab,
  // otherwise messages never dequeue if the operator stayed on Register / Pipeline / Mesh.
  useEffect(() => {
    if (backend.status !== "online") return;

    void handlePollRevealInbox();
    const id = setInterval(() => void handlePollRevealInbox(), 8000);
    return () => clearInterval(id);
  }, [backend.status, handlePollRevealInbox]);

  const chainMismatch = isConnected && chain?.id !== expectedChain.id;

  const primaryCls = (value: PrimaryWorkspace) =>
    `rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
      primary === value
        ? "bg-[#05058a] text-white shadow-sm"
        : "border border-[#05058a]/20 bg-white text-[#05058a]/80 hover:border-[#05058a]/45 hover:text-[#05058a]"
    }`;

  return (
    <div className="space-y-0 text-sm">
      <div className="space-y-3 border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <IntegrationStatusCards backend={backend} variant="compact" />
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button type="button" className={primaryCls("register")} onClick={() => setPrimary("register")}>
              Register
            </button>
            <button type="button" className={primaryCls("pipeline")} onClick={() => setPrimary("pipeline")}>
              Pipeline
            </button>
            <button type="button" className={primaryCls("manage")} onClick={() => setPrimary("manage")}>
              Manage
            </button>
            <button type="button" className={primaryCls("reveal")} onClick={() => setPrimary("reveal")}>
              Reveal
              {pendingFormalAuditRequests.length > 0 ? (
                <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                  {pendingFormalAuditRequests.length}
                </span>
              ) : null}
            </button>
            <button type="button" className={primaryCls("mesh")} onClick={() => setPrimary("mesh")}>
              Mesh
            </button>
          </div>
        </div>
        {chainMismatch ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Wallet is on {chain?.name ?? "another chain"}. Switch to {expectedChain.name} in the top bar before submitting transactions.
          </p>
        ) : null}
      </div>

      <div className="pt-5">
        {primary === "register" && (
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0 space-y-4 lg:max-w-none">
              <p className="text-xs text-neutral-500">
                Register a new AI agent with the SAIL contract.               </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    ENS name <span className="text-neutral-400">— or label</span>
                  </label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    placeholder="myagent.sail.eth"
                    value={regEns}
                    onChange={(event) => setRegEns(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    Stake (ETH) <span className="text-neutral-400">— min 0.01</span>
                  </label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    placeholder="0.01"
                    min="0.01"
                    step="0.001"
                    type="number"
                    value={regStake}
                    onChange={(event) => setRegStake(event.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Trust tier</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="reg-tier"
                      checked={regTier === 0}
                      onChange={() => setRegTier(0)}
                    />
                    {TIER_LABELS[0]}
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="reg-tier"
                      checked={regTier === 1}
                      onChange={() => setRegTier(1)}
                    />
                    {TIER_LABELS[1]}
                  </label>
                  <span
                    className="flex items-center gap-1.5 text-sm text-neutral-400 select-none"
                    aria-disabled="true"
                    title="Not available for registration"
                  >
                    <input type="radio" disabled tabIndex={-1} className="pointer-events-none opacity-50" />
                    {TIER_LABELS[2]}
                  </span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">
                  Auditor addresses (comma-separated)
                </label>
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                  placeholder="0xAuditor1, 0xAuditor2"
                  value={regAuditors}
                  onChange={(event) => setRegAuditors(event.target.value)}
                />
              </div>
              <button
                onClick={handleRegister}
                disabled={regBusy || backend.status !== "online"}
                className="rounded bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
              >
                {regBusy ? "Registering… (contract + ENS subname)" : "Register agent"}
              </button>

              {regError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {regError}
                </p>
              ) : null}
              {regResult ? (
                <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                  <p className="font-medium text-emerald-800">✓ Agent registered: {regResult.ens}</p>
                  <p>SAIL contract tx: <TxLink hash={regResult.txHash} /></p>
                  {regResult.ensSubname ? (
                    <p className="text-emerald-700">
                      ✓ ENS subname created
                      {regResult.ensSubname.pendingRecords ? " (text records writing in background…)" : ""}
                    </p>
                  ) : null}
                  {regResult.ensError ? (
                    <p className="text-amber-700">⚠ ENS subname: {regResult.ensError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {primary === "pipeline" && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Run the full SAIL pipeline: attest inputs → optional 0G Compute reasoning → Lit encrypt → 0G upload → SAIL anchor → execute gate.
            </p>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Agent ENS</label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    placeholder="myagent.sail.eth"
                    value={pipeEns}
                    onChange={(event) => setPipeEns(event.target.value)}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="block text-xs text-neutral-500">
                      Inputs (task, context, data)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PIPELINE_EXAMPLES.map((example) => (
                        <button
                          key={example.label}
                          type="button"
                          onClick={() => setPipeInputs(example.value)}
                          className="border border-[#05058a]/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#05058a]"
                        >
                          {example.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                    rows={8}
                    placeholder='{"task":"rebalance treasury","market":"ETH/USD 3200"}'
                    value={pipeInputs}
                    onChange={(event) => setPipeInputs(event.target.value)}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pipeSealedInference}
                    onChange={(event) => setPipeSealedInference(event.target.checked)}
                  />
                  Run 0G Compute sealed inference before commit
                </label>
                {pipeSealedInference ? (
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                    placeholder="System prompt for the reasoning model"
                    value={pipeSysPrompt}
                    onChange={(event) => setPipeSysPrompt(event.target.value)}
                  />
                ) : null}
                <button
                  onClick={handlePipeline}
                  disabled={pipeBusy || backend.status !== "online"}
                  className="rounded bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
                >
                  {pipeBusy ? "Running…" : "Run pipeline"}
                </button>
                {pipeStatus ? <p className="text-xs italic text-neutral-600">{pipeStatus}</p> : null}
                {pipeError ? (
                  <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {pipeError}
                  </p>
                ) : null}

                {pipeResult.inputHash || pipeResult.commit || pipeResult.executeTxHash ? (
                  <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-4 text-xs">
                    {pipeResult.inputHash ? (
                      <p>
                        <span className="text-neutral-500">Input hash:</span>{" "}
                        <span className="break-all font-mono">{pipeResult.inputHash}</span>
                      </p>
                    ) : null}
                    {pipeResult.reasoning ? (
                      <>
                        <p>
                          <span className="text-neutral-500">Model:</span>{" "}
                          <span className="font-mono">{pipeResult.reasoning.model}</span>
                        </p>
                        {pipeResult.reasoning.providerAddress ? (
                          <p>
                            <span className="text-neutral-500">Provider:</span>{" "}
                            <span className="font-mono">{shortAddr(pipeResult.reasoning.providerAddress)}</span>
                          </p>
                        ) : null}
                        <p className="flex items-center gap-2">
                          <span className="text-neutral-500">Verified:</span>
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-medium ${
                              pipeResult.reasoning.verified === true
                                ? "bg-emerald-100 text-emerald-700"
                                : pipeResult.reasoning.verified === false
                                  ? "bg-red-100 text-red-700"
                                  : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {pipeResult.reasoning.verified === true
                              ? "verified"
                              : pipeResult.reasoning.verified === false
                                ? "failed"
                                : "n/a"}
                          </span>
                        </p>
                        <p>
                          <span className="text-neutral-500">Decision:</span>{" "}
                          {pipeResult.reasoning.output}
                        </p>
                        {pipeResult.reasoning.attestation ? (
                          <p>
                            <span className="text-neutral-500">0G attestation:</span>{" "}
                            <span className="break-all font-mono">
                              {pipeResult.reasoning.attestation.slice(0, 80)}…
                            </span>
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {pipeResult.commit ? (
                      <>
                        <p>
                          <span className="text-neutral-500">Commitment hash:</span>{" "}
                          <span className="break-all font-mono">{pipeResult.commit.commitmentHash}</span>
                        </p>
                        <p>
                          <span className="text-neutral-500">0G root hash:</span>{" "}
                          <span className="break-all font-mono">{pipeResult.commit.cid}</span>
                        </p>
                        <p>
                          <span className="text-neutral-500">Commit tx:</span>{" "}
                          <TxLink hash={pipeResult.commit.txHash} />
                        </p>
                      </>
                    ) : null}
                    {pipeResult.executeTxHash ? (
                      <p>
                        <span className="text-neutral-500">Execute tx:</span>{" "}
                        <TxLink hash={pipeResult.executeTxHash} />
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <aside className="space-y-3 border border-neutral-200 bg-[#f5f5f0] p-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
                    0G Compute
                  </p>
                  <h3 className="mt-2 text-base font-bold text-[#05058a]">
                    Ledger &amp; providers
                  </h3>
                </div>

                {/* Ledger balance */}
                <div className="border border-neutral-200 bg-white p-3 text-[11px]">
                  <p className="text-neutral-500">Compute ledger</p>
                  {computeLedger ? (
                    <div className="mt-1 space-y-0.5">
                      <p>
                        <span className="text-neutral-500">Total:</span>{" "}
                        <span className="font-medium text-[#05058a]">
                          {neuronToA0gi(computeLedger.totalBalance)} 0G
                        </span>
                      </p>
                      <p>
                        <span className="text-neutral-500">Available:</span>{" "}
                        <span className="font-medium text-[#05058a]">
                          {neuronToA0gi(computeLedger.availableBalance)} 0G
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-amber-700">No ledger — run smoke test to create one</p>
                  )}
                </div>

                {computeError ? (
                  <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {computeError}
                  </p>
                ) : null}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Available providers</span>
                  <span className="font-medium text-[#05058a]">{computeProviders.length}</span>
                </div>

                {computeProviders.length ? (
                  <div className="space-y-2">
                    {computeProviders.slice(0, 6).map((p, idx) => (
                      <div key={`${p.provider}-${idx}`} className="border border-neutral-200 bg-white p-3 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-[#05058a]">{p.model}</p>
                          {p.teeSignerAcknowledged ? (
                            <span className="bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                              TEE ✓
                            </span>
                          ) : (
                            <span className="bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-500">
                              unack
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-neutral-500">{shortAddr(p.provider)}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-neutral-500">
                          <span>{p.verifiability}</span>
                          <span>in: {p.inputPrice}</span>
                          <span>out: {p.outputPrice}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    No compute providers returned from the backend yet.
                  </p>
                )}
              </aside>
            </div>
          </div>
        )}

        {primary === "manage" && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Look up contract state by ENS, or create and update the agent subname and text records for your operator wallet.
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">On-chain</p>
                  <h3 className="mt-2 text-base font-bold text-[#05058a]">Agent lookup</h3>
                </div>
                <p className="text-xs text-neutral-500">
                  Query the SAIL contract for wallet, stake, tier, auditors, and nonce — the canonical view for audit workflows.
                </p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    placeholder="myagent.sail.eth"
                    value={monEns}
                    onChange={(event) => setMonEns(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void handleMonitorLookup()}
                  />
                  <button
                    type="button"
                    onClick={handleMonitorLookup}
                    className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50"
                  >
                    Lookup
                  </button>
                </div>
                {monError ? (
                  <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {monError}
                  </p>
                ) : null}
                {monAgent ? (
                  <div className="rounded border border-neutral-200 bg-white p-4 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          monAgent.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {monAgent.active ? "active" : "slashed / inactive"}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px]">
                        {TIER_LABELS[monAgent.tier] ?? "unknown"} tier
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-x-4 gap-y-3 md:grid-cols-1">
                      <div>
                        <dt className="text-neutral-400">Wallet</dt>
                        <dd className="break-all font-mono">{monAgent.wallet}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-400">Stake (wei)</dt>
                        <dd className="font-mono">{monAgent.stake}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-400">Commitments</dt>
                        <dd>{monAgent.commitmentCount}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-400">Slashes</dt>
                        <dd>{monAgent.slashCount}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-400">Current nonce</dt>
                        <dd>{monAgent.nonce}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-400">Auditors</dt>
                        <dd className="space-y-1">
                          {monAgent.auditors.length ? (
                            monAgent.auditors.map((auditor) => (
                              <div key={auditor} className="break-all font-mono">
                                {auditor}
                              </div>
                            ))
                          ) : (
                            <span>None listed</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    {backend.contract ? (
                      <div className="mt-4">
                        <dt className="mb-1 text-neutral-400">Explorer</dt>
                        <a
                          href={`https://sepolia.etherscan.io/address/${backend.contract}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline"
                        >
                          View SAIL contract →
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

            <div className="space-y-4 border border-neutral-200 bg-white p-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
                  ENS register
                </p>
                <h3 className="mt-2 text-base font-bold text-[#05058a]">
                  Create or update the agent subname
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Parent name</label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    value={identityParent}
                    onChange={(event) => setIdentityParent(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Subdomain label</label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    placeholder="treasury-agent"
                    value={identityLabel}
                    onChange={(event) => setIdentityLabel(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs text-neutral-500">AXL peer id</label>
                    <button
                      type="button"
                      className="text-[10px] text-[#05058a] hover:underline disabled:opacity-40"
                      disabled={backend.status !== "online"}
                      onClick={async () => {
                        try {
                          const status = await getAxlStatus();
                          if (status.peerId) setIdentityAxlPeerId(status.peerId);
                          else alert("AXL node is offline — restart the backend with AXL_AUTO_START=true");
                        } catch {
                          alert("Could not fetch AXL peer ID");
                        }
                      }}
                    >
                      Auto-fill from AXL
                    </button>
                  </div>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                    placeholder="12D3KooW… (or click Auto-fill)"
                    value={identityAxlPeerId}
                    onChange={(event) => setIdentityAxlPeerId(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Capabilities</label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    value={identityCapabilities}
                    onChange={(event) => setIdentityCapabilities(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCheckOwnership}
                  disabled={identityOwnsBusy || backend.status !== "online"}
                  className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-40"
                >
                  {identityOwnsBusy ? "Checking…" : "Check parent ownership"}
                </button>
                <button
                  onClick={handleRegisterSubname}
                  disabled={identityRegisterBusy || backend.status !== "online"}
                  className="rounded bg-[#05058a] px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  {identityRegisterBusy ? "Registering… (2-3 min, 4 txs)" : "Register subname"}
                </button>
              </div>
              {identityOwns !== null ? (
                <p
                  className={`rounded px-3 py-2 text-xs ${
                    identityOwns
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {identityOwns
                    ? "Operator wallet owns the parent ENS name."
                    : "Operator wallet does not own the parent ENS name."}
                </p>
              ) : null}
              {identityOwnsError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {identityOwnsError}
                </p>
              ) : null}
              {identityRegisterError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {identityRegisterError}
                </p>
              ) : null}
              {identityRegisterResult ? (
                <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <p className="font-medium">✓ Subname created: {identityRegisterResult.ensName}</p>
                  {identityRegisterResult.pendingRecords && (
                    <p className="text-emerald-600">Text records writing in background (~1 min)…</p>
                  )}
                  <div className="space-y-1">
                    {identityRegisterResult.txHashes.map((hash) => (
                      <p key={hash}>
                        Tx: <TxLink hash={hash} />
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          </div>
        )}

        {primary === "reveal" && (
          <div className="space-y-4">
 
        
            <div className="rounded border border-[#05058a]/15 bg-[#f8f9fc] px-3 py-3 text-[11px]">
              <p className="font-semibold text-[#05058a]">Tracked axl_peer_id</p>
              <p className="mt-1 text-neutral-600">
                Saved when you publish a subname with <code className="font-mono text-[10px]">axl_peer_id</code>, discover an agent in Mesh, or add a row below. Compare each ENS row to{" "}
                <strong className="font-medium text-neutral-800">this node</strong> — if it does not match, auditors addressing ENS still send to the wrong mesh identity for{" "}
                <em className="font-medium">this</em> API&apos;s inbox.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-white bg-white/80 px-2 py-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">This API / recv node</p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-neutral-800">
                    {localAxlPeerStored ?? "—"}
                  </p>
                </div>
                <div className="rounded border border-white bg-white/80 px-2 py-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Last inbox poll</p>
                  <p className="mt-0.5 text-[10px] text-neutral-700">
                    {revealLastPollAt ? new Date(revealLastPollAt).toLocaleString() : "Not yet"}
                  </p>
                </div>
              </div>
              {recvPollStats ? (
                <div className="mt-2 rounded border border-neutral-200 bg-white px-2 py-2 text-[10px] leading-snug text-neutral-700">
                  <p className="font-semibold text-neutral-800">AXL bridge inbox (this backend)</p>
                  <p className="mt-1">
                    Messages returned to the app so far:{" "}
                    <strong className="text-neutral-900">{recvPollStats.totalMessagesReturned}</strong> · Last batch:{" "}
                    <strong>{recvPollStats.lastBatchMessages}</strong> (bridge GET /recv calls in that batch:{" "}
                    {recvPollStats.lastBridgeGets}) · Empty batches: {recvPollStats.emptyBatches}
                  </p>
                  {recvPollStats.totalMessagesReturned === 0 && recvPollStats.apiRecvCalls >= 2 ? (
                    <p className="mt-2 border-t border-amber-200/80 pt-2 text-amber-950">
                      The mesh inbox tied to this API is still empty. ENS ↔ peer &quot;Matches node&quot; only checks text vs{" "}
                      <code className="rounded bg-amber-50 px-1 font-mono text-[9px]">/api/axl/status</code> — if the auditor UI uses a{" "}
                      <em>different</em> API host than this dashboard, their send never reaches this recv queue. Align{" "}
                      <code className="rounded bg-amber-50 px-1 font-mono text-[9px]">NEXT_PUBLIC_SAIL_API_URL</code> /{" "}
                      <code className="rounded bg-amber-50 px-1 font-mono text-[9px]">SAIL_API_PROXY_TARGET</code> on both machines. Different clouds/NAT can also block mesh delivery even when ENS is correct.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {trackedAxlEntries.length > 0 ? (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto border border-neutral-200/80 bg-white p-2">
                  {trackedAxlEntries.map((e) => {
                    const localNode = localAxlPeerStored;
                    const match =
                      typeof localNode === "string" &&
                      localNode.length > 0 &&
                      peerIdsMatch(e.axlPeerId, localNode);
                    return (
                      <li
                        key={`${e.ens}-${e.updatedAt}`}
                        className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1 border-b border-neutral-100 pb-1 text-[10px] last:border-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-neutral-800">{e.ens}</span>
                          <span className="ml-2 text-neutral-400">({e.source})</span>
                          <p className="break-all font-mono text-[9px] text-neutral-500">{shortPeer(e.axlPeerId)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={
                              match
                                ? "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900"
                                : "rounded bg-amber-100 px-1.5 py-0.5 text-amber-950"
                            }
                          >
                            {match ? "Matches node" : "≠ node"}
                          </span>
                          <button
                            type="button"
                            className="text-[10px] text-red-600 underline"
                            onClick={() => setTrackedAxlEntries(removeTrackedAxlEntry(e.ens))}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-[10px] text-neutral-500">No rows saved yet — register identity or discover an agent.</p>
              )}
              <div className="mt-2 flex flex-col gap-2 border-t border-neutral-200/80 pt-2 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 text-[10px] text-neutral-500">
                  ENS
                  <input
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-[10px]"
                    placeholder="agent.sail.eth"
                    value={manualTrackEns}
                    onChange={(ev) => setManualTrackEns(ev.target.value)}
                  />
                </label>
                <label className="min-w-0 flex-[2] text-[10px] text-neutral-500">
                  axl_peer_id
                  <input
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-[10px]"
                    placeholder="12D3KooW…"
                    value={manualTrackPeer}
                    onChange={(ev) => setManualTrackPeer(ev.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleManualTrackPeer}
                  disabled={!manualTrackEns.trim() || !manualTrackPeer.trim()}
                  className="shrink-0 rounded border border-[#05058a] px-3 py-1.5 text-[10px] font-medium text-[#05058a] disabled:opacity-40"
                >
                  Save pair
                </button>
              </div>
            </div>

            {pendingFormalAuditRequests.length > 0 ? (
              <div className="space-y-3 rounded border border-[#05058a]/25 bg-[#05058a]/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#05058a]">
                  Pending audit requests
                </p>
                <ul className="space-y-3">
                  {pendingFormalAuditRequests.map((row) => {
                    const senderTrackedEns = trackedEnsForSender(row.from, trackedAxlEntries);
                    return (
                    <li
                      key={`${row.parsed.requestId}:${row.from}`}
                      className="rounded border border-neutral-200 bg-white p-4 text-xs shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                        <span className="font-mono text-[11px] text-[#05058a]">
                          From {shortPeer(row.from)}
                          {senderTrackedEns ? (
                            <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal text-neutral-700">
                              tracked: {senderTrackedEns}
                            </span>
                          ) : null}
                        </span>
                        <time className="text-[11px] text-neutral-400" dateTime={new Date(row.timestamp).toISOString()}>
                          {new Date(row.timestamp).toLocaleString()}
                        </time>
                      </div>
                      <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                        <div>
                          <dt className="text-neutral-400">requestId</dt>
                          <dd className="break-all font-mono">{row.parsed.requestId}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400">agentEns</dt>
                          <dd className="break-all font-mono">{row.parsed.agentEns}</dd>
                        </div>
                        {row.parsed.commitmentHash ? (
                          <div className="sm:col-span-2">
                            <dt className="text-neutral-400">commitmentHash</dt>
                            <dd className="break-all font-mono">{row.parsed.commitmentHash}</dd>
                          </div>
                        ) : null}
                        {row.parsed.auditor ? (
                          <div className="sm:col-span-2">
                            <dt className="text-neutral-400">auditor</dt>
                            <dd className="break-all font-mono">{row.parsed.auditor}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleFormalAuditResponse(row.from, row.parsed, "accept")}
                          disabled={auditRespondBusy || backend.status !== "online"}
                          className="rounded bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-emerald-700"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleFormalAuditResponse(row.from, row.parsed, "deny")}
                          disabled={auditRespondBusy || backend.status !== "online"}
                          className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
                        >
                          Deny
                        </button>
                      </div>
                      <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-neutral-100 bg-[#f8f8f4] p-2 font-mono text-[10px] text-neutral-600">
                        {row.message}
                      </pre>
                    </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {auditRespondError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{auditRespondError}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handlePollRevealInbox()}
                disabled={revealInboxBusy || backend.status !== "online"}
                className="rounded bg-[#05058a] px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {revealInboxBusy ? "Polling…" : "Refresh inbox"}
              </button>
              <button
                type="button"
                onClick={() => setRevealInbox([])}
                disabled={revealInbox.length === 0}
                className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-40"
              >
                Clear list
              </button>
              <span className="text-xs text-neutral-400">
                Auto-refreshes every 8s while the API is online (any workspace tab).
              </span>
            </div>
            {revealInboxError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{revealInboxError}</p>
            ) : null}
            {revealInboxBusy && revealInbox.length === 0 ? (
              <p className="rounded border border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-xs text-neutral-500">
                Polling AXL…
              </p>
            ) : revealInbox.length === 0 ? (
              <p className="rounded border border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-xs text-neutral-500">
                No auditor reveal traffic yet. When an auditor sends a SEAL audit request or reveal submission to this node’s AXL peer, it will appear here.
              </p>
            ) : (
              <ul className="space-y-3">
                {revealInbox.map((row) => {
                  const inboxTrackedEns = trackedEnsForSender(row.from, trackedAxlEntries);
                  return (
                  <li
                    key={`${row.timestamp}-${row.from}-${row.message.slice(0, 48)}`}
                    className="rounded border border-neutral-200 bg-white p-4 text-xs shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                      <span className="font-mono text-[11px] text-[#05058a]">
                        {shortPeer(row.from)}
                        {inboxTrackedEns ? (
                          <span className="ml-2 rounded bg-neutral-100 px-1.5 text-[10px] text-neutral-700">
                            {inboxTrackedEns}
                          </span>
                        ) : null}
                      </span>
                      <time className="text-[11px] text-neutral-400" dateTime={new Date(row.timestamp).toISOString()}>
                        {new Date(row.timestamp).toLocaleString()}
                      </time>
                    </div>
                    {row.topic ? (
                      <p className="mt-2 text-[11px] text-neutral-500">
                        Topic: <span className="font-mono">{row.topic}</span>
                      </p>
                    ) : null}
                    <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-neutral-100 bg-[#f8f8f4] p-3 font-mono text-[11px] text-neutral-800">
                      {row.message}
                    </pre>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {primary === "mesh" && (
          <div className="grid gap-4 xl:grid-cols-3">
            {/* --- LEFT: Topology + Discovery --- */}
            <div className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
              {/* Topology */}
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">AXL topology</p>
                <h3 className="mt-2 text-base font-bold text-[#05058a]">Mesh health</h3>
              </div>
              <button
                onClick={handleRefreshMesh}
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
                      <button key={peer.peerId} onClick={() => setMeshSendTo(peer.peerId)} className="block w-full border border-neutral-200 bg-white p-2 text-left hover:bg-neutral-50">
                        <p className="font-mono text-[11px] text-[#05058a]">{shortPeer(peer.peerId)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Agent Discovery */}
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
                    onClick={handleDiscover}
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
                    {discoveredAgent.reachable && (
                      <button
                        onClick={() => { setDelegateWorker(discoveredAgent.ensName); setDelegateAgentEns(discoveredAgent.ensName); }}
                        className="mt-1 inline-block rounded bg-[#05058a] px-2 py-1 text-[10px] text-white"
                      >
                        Queue for delegation →
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* --- MIDDLE: Delegation + Low-level messaging --- */}
            <div className="space-y-4 border border-neutral-200 bg-white p-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Delegation</p>
                <h3 className="mt-2 text-base font-bold text-[#05058a]">Delegate task to worker</h3>
                <p className="mt-1 text-xs text-neutral-500">The worker auto-runs the SAIL pipeline and returns a commitmentHash proving correct execution.</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Worker ENS</label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    placeholder="worker.sail.eth"
                    value={delegateWorker}
                    onChange={(e) => setDelegateWorker(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Task prompt</label>
                  <textarea
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                    rows={4}
                    placeholder="Analyze this treasury rebalancing scenario and recommend an allocation..."
                    value={delegateTask_}
                    onChange={(e) => setDelegateTask_(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">Commit as agent ENS</label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    placeholder="your-agent.sail.eth"
                    value={delegateAgentEns}
                    onChange={(e) => setDelegateAgentEns(e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={handleDelegate}
                disabled={delegateBusy || backend.status !== "online"}
                className="rounded bg-[#05058a] px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {delegateBusy ? "Delegating…" : "Delegate task"}
              </button>
              {delegateError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{delegateError}</p>
              ) : null}
              {delegateResult ? (
                <div className="space-y-1 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <p className="font-medium">✓ Task sent</p>
                  <p className="font-mono text-[10px]">Task ID: {delegateResult.id}</p>
                  <p className="text-[10px]">Status: {delegateResult.status}</p>
                </div>
              ) : null}

              {/* Raw messaging (kept for advanced use) */}
              <div className="border-t border-neutral-200 pt-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Raw AXL messaging</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">To peer</label>
                    <input className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs" value={meshSendTo} onChange={(e) => setMeshSendTo(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">Topic</label>
                    <input className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs" value={meshTopic} onChange={(e) => setMeshTopic(e.target.value)} />
                  </div>
                </div>
                <textarea className="mt-2 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs" rows={3} value={meshMessage} onChange={(e) => setMeshMessage(e.target.value)} />
                <div className="mt-2 flex gap-2">
                  <button onClick={handleSendMeshMessage} disabled={meshSendBusy || backend.status !== "online"} className="rounded border border-[#05058a] px-3 py-1.5 text-xs text-[#05058a] disabled:opacity-40">
                    {meshSendBusy ? "…" : "Send"}
                  </button>
                  <button onClick={handlePollInbox} disabled={meshInboxBusy || backend.status !== "online"} className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-40">
                    {meshInboxBusy ? "…" : "Poll"}
                  </button>
                </div>
              </div>
            </div>

            {/* --- RIGHT: Delegations + Processed tasks --- */}
            <div className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Tracking</p>
                <h3 className="mt-2 text-base font-bold text-[#05058a]">Your delegations</h3>
                <p className="mt-1 text-xs text-neutral-500">Auto-updates every 3s when this tab is open.</p>
              </div>

              {delegationList.length ? (
                <div className="space-y-2">
                  {delegationList.slice(0, 5).map((d) => (
                    <div key={d.id} className="border border-neutral-200 bg-white p-3 text-[11px]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[#05058a]">{d.id.slice(0, 12)}…</p>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium ${
                          d.status === "completed" ? "bg-emerald-100 text-emerald-700" : d.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        }`}>{d.status}</span>
                      </div>
                      <p className="mt-1 text-neutral-600">To: {d.workerEns}</p>
                      <p className="text-neutral-500 line-clamp-2">{d.task}</p>
                      {d.result && (
                        <div className="mt-2 border-t border-neutral-200 pt-2 text-[10px]">
                          <p>Output: {d.result.output.slice(0, 60)}…</p>
                          <span className={`mt-1 inline-block px-1.5 py-0.5 text-[9px] ${
                            d.result.verified === true
                              ? "bg-emerald-100 text-emerald-700"
                              : d.result.verified === false
                                ? "bg-red-100 text-red-700"
                                : "bg-neutral-100 text-neutral-500"
                          }`}>
                            {d.result.verified === true
                              ? "TEE verified"
                              : d.result.verified === false
                                ? "TEE rejected"
                                : "TEE sig not stored (testnet)"}
                          </span>
                          <p className="mt-1 text-neutral-400">Commitment: {shortAddr(d.result.commitmentHash)}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">No delegations yet. Delegate a task to a worker agent and results will appear here.</p>
              )}

              {/* Processed tasks (worker side) */}
              <div className="border-t border-neutral-200 pt-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Processed tasks</p>
                <p className="mt-1 text-xs text-neutral-500">Tasks this node received and processed for others.</p>
                {processedTaskList.length ? (
                  <div className="mt-2 space-y-2">
                    {processedTaskList.slice(0, 5).map((t) => (
                      <div key={t.taskId} className="border border-neutral-200 bg-white p-3 text-[11px]">
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-[#05058a]">{t.taskId.slice(0, 12)}…</p>
                          <span className={`px-1.5 py-0.5 text-[10px] ${
                            t.status === "completed" ? "bg-emerald-100 text-emerald-700" : t.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}>{t.status}</span>
                        </div>
                        <p className="text-neutral-600">From: {shortPeer(t.from)}</p>
                        <p className="text-neutral-500 line-clamp-1">{t.task}</p>
                        {t.result && (
                          <div className="mt-1 text-[10px] text-neutral-400">Commitment: {shortAddr(t.result.commitmentHash)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">No tasks processed yet. Ensure the Task Router is running.</p>
                )}
              </div>

              {/* Task router control */}
              <div className="border-t border-neutral-200 pt-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">Task router</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={async () => { await startTaskRouter(); await refreshDelegations(); }} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white">Start</button>
                  <button onClick={async () => { await stopTaskRouter(); await refreshDelegations(); }} className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">Stop</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
