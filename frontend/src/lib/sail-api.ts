/**
 * Thin client for the SAIL backend HTTP API.
 * Defaults to same-origin (proxied via next.config.mjs rewrites).
 */

import { sailApiBase } from "./wagmi-config";

function url(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sailApiBase ? `${sailApiBase}${p}` : p;
}

/** Browser + Node 18+; fallback for older runtimes. */
function requestTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "error" in (body as Record<string, unknown>)
        ? String((body as Record<string, unknown>).error)
        : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

// Health
export async function healthCheck() {
  return jsonRequest<{
    ok: boolean;
    contract: string;
    operator: string;
    chainId: number;
    axl?: {
      online: boolean;
      bridgeUrl?: string;
    };
    timestamp: string;
  }>("/health");
}

// Reads
export async function getAgent(ens: string) {
  return jsonRequest<{
    agent: {
      wallet: string;
      stake: string;
      tier: number;
      active: boolean;
      auditors: string[];
      commitmentCount: string;
      slashCount: string;
    };
    nonce: string;
  }>(`/api/agents/${encodeURIComponent(ens)}`);
}

/** CommitmentPosted log rows for an agent + current on-chain execute flag (for auditor lookup). */
export async function getAgentCommitments(ens: string) {
  return jsonRequest<{
    agent: {
      wallet: string;
      stake: string;
      tier: number;
      active: boolean;
      auditors: string[];
      commitmentCount: string;
      slashCount: string;
    };
    nonce: string;
    commitments: Array<{
      txHash: string;
      blockNumber: string;
      logIndex: string;
      commitmentHash: string;
      cid: string;
      nonce: string;
      inputHash: string;
      timestamp: string;
      executed: boolean;
    }>;
    /** Exact `string` key used on-chain (after normalization / fallback). */
    resolvedEns: string;
  }>(`/api/agents/${encodeURIComponent(ens)}/commitments`);
}

export async function getCommitment(hash: string) {
  return jsonRequest<{
    commitment: {
      inputHash: string;
      commitmentHash: string;
      cid: string;
      nonce: string;
      timestamp: string;
      executed: boolean;
    };
    /** Agent ENS from the original commit() tx; null if not derivable. */
    resolvedEns: string | null;
  }>(`/api/commitments/${encodeURIComponent(hash.trim())}`);
}

/** In-memory agent task board (same store as `create_sail_task` / `claim_sail_task` MCP). */
export type SailBoardTask = {
  id: string;
  posterAgentEns: string;
  title: string;
  instruction: string;
  inputs: unknown;
  createdAt: number;
  status: "open" | "claimed" | "cancelled";
  claimedByAgentEns?: string;
  claimedAt?: number;
};

export async function getOpenAgentTasks() {
  return jsonRequest<{ tasks: SailBoardTask[] }>("/api/agent-tasks/open");
}

/** Gigs posted by this agent (open, claimed, cancelled) — same store as MCP create_sail_task. */
export async function getPostedAgentTasks(posterAgentEns: string) {
  return jsonRequest<{ tasks: SailBoardTask[] }>(
    `/api/agent-tasks/posted/${encodeURIComponent(posterAgentEns.trim())}`,
  );
}

export async function createAgentTask(input: {
  posterAgentEns: string;
  instruction: string;
  title?: string;
  inputs?: unknown;
}) {
  return jsonRequest<{ task: SailBoardTask }>("/api/agent-tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getAgentTaskById(id: string) {
  return jsonRequest<{ task: SailBoardTask }>(`/api/agent-tasks/${encodeURIComponent(id.trim())}`);
}

export async function getComputeProviders(modelFilter?: string) {
  const qs = modelFilter ? `?model=${encodeURIComponent(modelFilter)}` : "";
  return jsonRequest<{
    providers: ComputeProvider[];
    total: number;
  }>(`/api/compute/providers${qs}`);
}

export type ComputeProvider = {
  provider: string;
  model: string;
  url: string;
  inputPrice: string;
  outputPrice: string;
  verifiability: string;
  teeSignerAcknowledged: boolean;
};

export type LedgerInfo = {
  totalBalance: string;
  availableBalance: string;
  [key: string]: unknown;
};

export async function setupComputeLedger(amount: number) {
  return jsonRequest<{ action: "created" | "deposited"; amount: number }>(
    "/api/compute/ledger/setup",
    { method: "POST", body: JSON.stringify({ amount }) },
  );
}

export async function depositComputeFund(amount: number) {
  return jsonRequest<{ ok: boolean; deposited: number }>(
    "/api/compute/ledger/deposit",
    { method: "POST", body: JSON.stringify({ amount }) },
  );
}

export async function getComputeLedger() {
  return jsonRequest<{ ledger: LedgerInfo }>("/api/compute/ledger");
}

export async function getComputeLedgerProviders() {
  return jsonRequest<{
    providers: Array<{ provider: string; balance: string; pendingRefund: string }>;
  }>("/api/compute/ledger/providers");
}

export async function resolveEnsName(name: string) {
  return jsonRequest<{
    ensName: string;
    records: Record<string, string>;
  }>(`/api/ens/resolve/${encodeURIComponent(name)}`);
}

export async function ownsEnsName(name: string) {
  return jsonRequest<{
    ensName: string;
    owns: boolean;
  }>(`/api/ens/owns/${encodeURIComponent(name)}`);
}

export async function registerEnsSubname(input: {
  parentName: string;
  subLabel: string;
  records: Record<string, string>;
  walletAddr?: string;
}) {
  return jsonRequest<{
    ensName: string;
    txHashes: `0x${string}`[];
    pendingRecords?: boolean;
  }>("/api/ens/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Mirrors backend `gensyn/client.ts` recv counters — proves whether /recv batches ever see mail. */
export type RecvPollStats = {
  apiRecvCalls: number;
  lastApiRecvAt: string | null;
  lastBatchMessages: number;
  lastBridgeGets: number;
  totalMessagesReturned: number;
  emptyBatches: number;
};

export async function getAxlStatus() {
  return jsonRequest<{
    online: boolean;
    peerId?: string;
    address?: string;
    peers?: Array<{ peerId: string; address: string }>;
    tree?: unknown;
    recvPoll?: RecvPollStats;
  }>("/api/axl/status");
}

export async function sendAxlMessage(input: {
  to: string;
  message: string;
  topic?: string;
}) {
  /** Longer than backend AXL send timeout so the client sees the server error body first. */
  const SEND_WAIT_MS = 70_000;
  return jsonRequest<{ sent: boolean }>("/api/axl/send", {
    method: "POST",
    body: JSON.stringify(input),
    signal: requestTimeoutSignal(SEND_WAIT_MS),
  });
}

export async function receiveAxlMessages(since?: number) {
  const qs = since ? `?since=${since}` : "";
  return jsonRequest<{
    messages: Array<{
      from: string;
      message: string;
      topic?: string;
      timestamp: number;
    }>;
    recvPoll?: RecvPollStats;
  }>(`/api/axl/recv${qs}`);
}

// Register
export async function registerAgent(input: {
  ens: string;
  tier?: 0 | 1 | 2;
  auditors: string[];
  stakeEth?: string;
  skipEns?: boolean;
  ensExtraRecords?: Record<string, string>;
}) {
  return jsonRequest<{
    txHash: `0x${string}`;
    ens: string;
    agent: unknown;
    ensSubname?: { txHashes: `0x${string}`[]; pendingRecords?: boolean } | null;
  }>("/api/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Pipeline
export type AttestResponse = { inputHash: `0x${string}`; timestamp: number };

export async function attestInputs(inputs: unknown): Promise<AttestResponse> {
  return jsonRequest("/api/attest", {
    method: "POST",
    body: JSON.stringify({ inputs }),
  });
}

export type ReasonResponse = {
  output: string;
  attestation?: string;
  verified: boolean | null;
  model: string;
  providerAddress: string;
};

export async function reason(prompt: string, systemPrompt?: string): Promise<ReasonResponse> {
  return jsonRequest("/api/reason", {
    method: "POST",
    body: JSON.stringify({ prompt, systemPrompt }),
  });
}

export type CommitResponse = {
  commitmentHash: `0x${string}`;
  cid: string;
  nonce: string;
  txHash: `0x${string}`;
};

export async function commitToSail(input: {
  agentEns: string;
  inputHash: string;
  decision: string;
  proposedAction: string;
  attestation?: string;
}): Promise<CommitResponse> {
  return jsonRequest("/api/commit", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ExecuteResponse = {
  txHash: `0x${string}`;
  commitmentHash: `0x${string}`;
};

export async function executeCommitment(
  agentEns: string,
  commitmentHash: string,
): Promise<ExecuteResponse> {
  return jsonRequest("/api/execute", {
    method: "POST",
    body: JSON.stringify({ agentEns, commitmentHash }),
  });
}

// AXL — Agent discovery + delegation

export type DiscoveredAgent = {
  ensName: string;
  records: Record<string, string>;
  agent: {
    wallet: string;
    stake: string;
    tier: number;
    active: boolean;
    auditors: string[];
    commitmentCount: string;
    slashCount: string;
  } | null;
  sailContract: string;
  reachable: boolean;
};

export async function discoverAgent(ensName: string): Promise<DiscoveredAgent> {
  return jsonRequest(`/api/axl/discover/${encodeURIComponent(ensName)}`);
}

export type DelegationRecord = {
  id: string;
  workerEns: string;
  workerPeerId: string;
  task: string;
  context?: unknown;
  sentAt: number;
  status: "pending" | "completed" | "failed";
  result?: {
    type: string;
    from: string;
    taskId: string;
    commitmentHash: string;
    cid: string;
    txHash: string;
    output: string;
    model?: string;
    verified?: boolean | null;
    timestamp: number;
  };
  error?: string;
};

export async function delegateTask(input: {
  workerEns: string;
  task: string;
  agentEns: string;
  context?: unknown;
}): Promise<DelegationRecord> {
  return jsonRequest("/api/axl/delegate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getDelegations() {
  return jsonRequest<{ delegations: DelegationRecord[] }>("/api/axl/delegations");
}

export async function getDelegation(id: string) {
  return jsonRequest<DelegationRecord>(`/api/axl/delegations/${id}`);
}

export type ProcessedTask = {
  taskId: string;
  from: string;
  task: string;
  status: "processing" | "completed" | "failed";
  result?: DelegationRecord["result"];
  error?: string;
};

export async function getProcessedTasks() {
  return jsonRequest<{ tasks: ProcessedTask[] }>("/api/axl/tasks");
}

export async function startTaskRouter() {
  return jsonRequest<{ started: boolean }>("/api/axl/router/start", { method: "POST" });
}

export async function stopTaskRouter() {
  return jsonRequest<{ stopped: boolean }>("/api/axl/router/stop", { method: "POST" });
}

// Audit
export type SealedBlobResponse = {
  ciphertext: string;
  dataToEncryptHash: string;
  accessConditions: unknown;
};

export async function fetchSealedBlob(cid: string): Promise<SealedBlobResponse> {
  return jsonRequest(`/api/reveal/${encodeURIComponent(cid)}`);
}

export type AuditCommitmentResult = {
  commitmentHash: string;
  onChain: {
    inputHash: string;
    cid: string;
    nonce: string;
    timestamp: string;
    executed: boolean;
  };
  decryptMode: "aes-fallback" | "chipotle" | "lit-required" | "none";
  plaintext?: {
    inputHash: string;
    decision: string;
    proposedAction: string;
    attestation?: string;
    agentEns: string;
    timestamp: number;
  };
  hashVerified: boolean;
  note?: string;
};

export async function auditCommitment(
  hash: string,
  auditorAddress?: string,
): Promise<AuditCommitmentResult> {
  const params = auditorAddress ? `?auditor=${encodeURIComponent(auditorAddress)}` : "";
  return jsonRequest(`/api/audit/${encodeURIComponent(hash)}${params}`);
}
