"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TIER_LABELS } from "@/lib/sail-abi";
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
  registerAgent,
  registerEnsSubname,
  resolveEnsName,
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
import { expectedChain } from "@/lib/wagmi-config";
import { StatusDot } from "@/components/ui/StatusDot";
import { TxLink } from "@/components/ui/TxLink";

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

type Tab = "register" | "pipeline" | "monitor" | "identity" | "mesh";

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

type EnsRecords = Record<string, string>;

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

function tierRecordValue(tier: 0 | 1 | 2) {
  return tier === 0 ? "optimistic" : tier === 1 ? "zk" : "tee";
}

function shortPeer(peerId: string) {
  return peerId.length > 24 ? `${peerId.slice(0, 14)}…${peerId.slice(-8)}` : peerId;
}

export function SailOperatorPanel() {
  const { address, isConnected, chain } = useAccount();
  const backend = useBackendStatus();

  const [tab, setTab] = useState<Tab>("register");

  const [computeProviders, setComputeProviders] = useState<ComputeProvider[]>([]);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [computeLedger, setComputeLedger] = useState<LedgerInfo | null>(null);

  const [regEns, setRegEns] = useState("");
  const [regTier, setRegTier] = useState<0 | 1 | 2>(0);
  const [regAuditors, setRegAuditors] = useState("");
  const [regStake, setRegStake] = useState("0.01");
  const [regBusy, setRegBusy] = useState(false);
  const [regResult, setRegResult] = useState<{ txHash: string; ens: string } | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  const [pipeEns, setPipeEns] = useState("");
  const [pipeInputs, setPipeInputs] = useState("");
  const [pipeZk, setPipeZk] = useState(false);
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

  const [identityName, setIdentityName] = useState("");
  const [identityParent, setIdentityParent] = useState(
    process.env.NEXT_PUBLIC_ENS_PARENT_NAME ?? "sail.eth",
  );
  const [identityLabel, setIdentityLabel] = useState("");
  const [identityCapabilities, setIdentityCapabilities] = useState(
    "commit,execute,audit,delegate",
  );
  const [identityAxlPeerId, setIdentityAxlPeerId] = useState("");
  const [identityResolveBusy, setIdentityResolveBusy] = useState(false);
  const [identityResolveError, setIdentityResolveError] = useState<string | null>(null);
  const [identityRecords, setIdentityRecords] = useState<EnsRecords | null>(null);
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

  async function handleRegister() {
    setRegBusy(true);
    setRegError(null);
    setRegResult(null);

    try {
      if (!regEns.trim()) throw new Error("ENS name required");
      const auditors = regAuditors
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!auditors.length) throw new Error("At least one auditor address required");

      const result = await registerAgent({
        ens: regEns.trim(),
        tier: regTier,
        auditors,
        stakeEth: regStake,
      });
      setRegResult({ txHash: result.txHash, ens: result.ens });
      setPipeEns(result.ens);
      setMonEns(result.ens);
      setIdentityName(result.ens);

      const [label, ...rest] = result.ens.split(".");
      if (rest.length > 1) {
        setIdentityLabel(label);
        setIdentityParent(rest.join("."));
      }
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

      if (pipeZk) {
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
      const commit = await commitToSail({
        agentEns: pipeEns.trim(),
        inputHash: result.inputHash!,
        decision,
        proposedAction: "0xPLACEHOLDER",
        attestation,
      });
      result.commit = commit;
      setPipeResult({ ...result });

      setPipeStatus("04 — clearing execute gate");
      const execute = await executeCommitment(pipeEns.trim(), commit.commitmentHash);
      result.executeTxHash = execute.txHash;
      setPipeResult({ ...result });

      setPipeStatus("done");
    } catch (error) {
      setPipeError(friendlyError((error as Error).message ?? String(error)));
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

  async function handleResolveEns() {
    setIdentityResolveBusy(true);
    setIdentityResolveError(null);
    setIdentityRecords(null);

    try {
      if (!identityName.trim()) throw new Error("ENS name required");
      const result = await resolveEnsName(identityName.trim());
      setIdentityRecords(result.records);
    } catch (error) {
      setIdentityResolveError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setIdentityResolveBusy(false);
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
          sail_tier: tierRecordValue(regTier),
          sail_contract: backend.contract ?? "",
          capabilities: identityCapabilities.trim(),
          auditors: regAuditors.trim(),
        },
      });

      setIdentityRegisterResult(result);
      setIdentityName(result.ensName);
    } catch (error) {
      setIdentityRegisterError(friendlyError((error as Error).message ?? String(error)));
    } finally {
      setIdentityRegisterBusy(false);
    }
  }

  async function handleRefreshMesh() {
    setMeshStatusBusy(true);
    setMeshStatusError(null);

    try {
      const result = await getAxlStatus();
      setMeshTopology(result);
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

  // --- Agent discovery ---
  async function handleDiscover() {
    setDiscoverBusy(true);
    setDiscoverError(null);
    setDiscoveredAgent(null);

    try {
      if (!discoverEns.trim()) throw new Error("ENS name required");
      const result = await discoverAgent(discoverEns.trim());
      setDiscoveredAgent(result);
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

  // Auto-refresh delegations when tab is mesh
  useEffect(() => {
    if (tab !== "mesh") return;
    if (backend.status !== "online") return;

    const id = setInterval(() => refreshDelegations(), 3000);
    refreshDelegations();
    return () => clearInterval(id);
  }, [tab, backend.status]);

  const chainMismatch = isConnected && chain?.id !== expectedChain.id;

  const tabCls = (value: Tab) =>
    `px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
      tab === value
        ? "border-[#05058a] text-[#05058a]"
        : "border-transparent text-neutral-500 hover:text-neutral-800"
    }`;

  return (
    <div className="space-y-0 text-sm">
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-bold text-[#05058a]">Operator Console</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Backend{" "}
              <StatusDot
                status={backend.status}
                label={
                  backend.status === "online"
                    ? "online"
                    : backend.status === "offline"
                      ? "offline"
                      : "checking…"
                }
              />
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500">
            <span className="border border-neutral-200 px-2 py-1">
              Expected chain: {expectedChain.name}
            </span>
            {backend.contract ? (
              <span className="border border-neutral-200 px-2 py-1">
                Contract: {backend.contract.slice(0, 10)}…{backend.contract.slice(-6)}
              </span>
            ) : null}
            {backend.axlOnline !== undefined ? (
              <span className="border border-neutral-200 px-2 py-1">
                AXL: {backend.axlOnline ? "online" : "offline"}
              </span>
            ) : null}
          </div>
          {chainMismatch ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Wallet is connected to {chain?.name ?? "another chain"}. Switch to {expectedChain.name} before using write flows.
            </p>
          ) : null}
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>

      <div className="flex flex-wrap border-b border-neutral-200">
        <button className={tabCls("register")} onClick={() => setTab("register")}>Register</button>
        <button className={tabCls("pipeline")} onClick={() => setTab("pipeline")}>Pipeline</button>
        <button className={tabCls("monitor")} onClick={() => setTab("monitor")}>Monitor</button>
        <button className={tabCls("identity")} onClick={() => setTab("identity")}>Identity</button>
        <button className={tabCls("mesh")} onClick={() => setTab("mesh")}>Mesh</button>
      </div>

      <div className="pt-5">
        {tab === "register" && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Register a new AI agent with the SAIL contract. The backend operator wallet signs the transaction and locks the stake.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">ENS name</label>
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
              <div className="flex flex-wrap gap-3">
                {([0, 1, 2] as const).map((tier) => (
                  <label key={tier} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input type="radio" checked={regTier === tier} onChange={() => setRegTier(tier)} />
                    {TIER_LABELS[tier]}
                  </label>
                ))}
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
              {regBusy ? "Registering…" : "Register agent"}
            </button>

            {regError ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {regError}
              </p>
            ) : null}
            {regResult ? (
              <div className="space-y-1 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                <p className="font-medium text-emerald-800">✓ Agent registered: {regResult.ens}</p>
                <p>
                  Tx: <TxLink hash={regResult.txHash} />
                </p>
              </div>
            ) : null}
          </div>
        )}

        {tab === "pipeline" && (
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
                    checked={pipeZk}
                    onChange={(event) => setPipeZk(event.target.checked)}
                  />
                  Use ZK tier and route reasoning through 0G Compute
                </label>
                {pipeZk ? (
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

        {tab === "monitor" && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Look up any registered SAIL agent by ENS name and inspect the contract-level state that drives auditability.
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
              <div className="rounded border border-neutral-200 p-4 text-xs">
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
                <dl className="mt-4 grid gap-x-4 gap-y-3 md:grid-cols-2">
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
        )}

        {tab === "identity" && (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
                  ENS resolve
                </p>
                <h3 className="mt-2 text-base font-bold text-[#05058a]">Inspect live records</h3>
              </div>
              <input
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="myagent.sail.eth"
                value={identityName}
                onChange={(event) => setIdentityName(event.target.value)}
              />
              <button
                onClick={handleResolveEns}
                disabled={identityResolveBusy || backend.status !== "online"}
                className="rounded border border-[#05058a] px-4 py-2 text-sm text-[#05058a] disabled:opacity-40"
              >
                {identityResolveBusy ? "Resolving…" : "Resolve ENS"}
              </button>
              {identityResolveError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {identityResolveError}
                </p>
              ) : null}
              {identityRecords ? (
                <pre className="overflow-auto rounded border border-neutral-200 bg-white p-3 text-[11px] text-neutral-700">
                  {JSON.stringify(identityRecords, null, 2)}
                </pre>
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
                  <label className="mb-1 block text-xs text-neutral-500">AXL peer id</label>
                  <input
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                    placeholder="12D3KooW..."
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
        )}

        {tab === "mesh" && (
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
                        <p>Tier: {["optimistic", "zk", "tee"][discoveredAgent.agent.tier]}</p>
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
                          {d.result.verified !== undefined && (
                            <span className={`mt-1 inline-block px-1.5 py-0.5 ${d.result.verified ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {d.result.verified ? "Verified" : "Failed verify"}
                            </span>
                          )}
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
