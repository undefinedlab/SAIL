/**
 * AXL Task Router — agent-to-agent task processing.
 *
 * Listens for incoming `sail.task` messages via AXL, auto-runs the full
 * SAIL pipeline (attest → reason → commit → execute), and sends the result
 * back to the requesting agent via AXL.
 *
 * Also tracks outbound delegations so the hiring agent can poll for results.
 *
 * Message protocol:
 *   sail.task     → { type, from, task, context, replyTopic, sailContract, timestamp }
 *   sail.result   → { type, from, taskId, commitmentHash, output, model, verified, cid, txHash, timestamp }
 *   sail.ack      → { type, taskId, status }
 *   sail.error    → { type, taskId, error }
 */

import { randomUUID } from "node:crypto";
import * as axl from "./client.js";
import * as pipeline from "../src/api/pipeline.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskMessage = {
  type: "sail.task";
  from: string;         // sender peer ID or ENS
  taskId: string;       // unique ID so both sides can correlate
  task: string;         // the actual prompt / instruction
  context?: unknown;    // structured context
  agentEns: string;     // which agent ENS to commit under
  replyTopic?: string;  // topic for the result (default: "sail.result")
  sailContract?: string;
  timestamp: number;
};

export type TaskResult = {
  type: "sail.result";
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

export type TaskError = {
  type: "sail.error";
  from: string;
  taskId: string;
  error: string;
  timestamp: number;
};

export type DelegationRecord = {
  id: string;
  workerEns: string;
  workerPeerId: string;
  task: string;
  context?: unknown;
  sentAt: number;
  status: "pending" | "completed" | "failed";
  result?: TaskResult;
  error?: string;
};

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

/** Tasks we received and processed (worker side) */
const processedTasks: Map<string, { task: TaskMessage; result?: TaskResult; error?: string }> = new Map();

/** Delegations we sent out (hiring side) */
const delegations: Map<string, DelegationRecord> = new Map();

/** Background poll interval handle */
let pollHandle: ReturnType<typeof setInterval> | null = null;
let lastPollTimestamp = 0;

// ---------------------------------------------------------------------------
// Worker side — process incoming tasks
// ---------------------------------------------------------------------------

/**
 * Process a single incoming task message:
 *   1. Send ack
 *   2. Run full SAIL pipeline (attest → reason → commit → execute)
 *   3. Send result back
 */
async function processIncomingTask(msg: axl.ReceivedMessage): Promise<void> {
  let parsed: TaskMessage;
  try {
    parsed = JSON.parse(msg.message) as TaskMessage;
  } catch {
    return; // not a valid task message
  }

  if (parsed.type !== "sail.task") return;

  const taskId = parsed.taskId || randomUUID();
  console.log(`[TaskRouter] received task ${taskId} from ${msg.from}: "${parsed.task?.slice(0, 80)}"`);

  processedTasks.set(taskId, { task: parsed });

  // Send ack
  try {
    await axl.sendMessage({
      to: msg.from,
      message: JSON.stringify({ type: "sail.ack", taskId, status: "processing" }),
      topic: "sail.ack",
    });
  } catch (e) {
    console.warn("[TaskRouter] failed to send ack:", (e as Error).message);
  }

  try {
    // Stage 01 — Attest
    const inputs = parsed.context
      ? { task: parsed.task, context: parsed.context }
      : parsed.task;
    const attest = pipeline.attestInputs(inputs);

    // Stage 02 — Reason via 0G Compute
    const reasoning = await pipeline.reason(
      parsed.task,
      "You are an autonomous AI agent processing a delegated task. Respond with a clear, actionable decision.",
    );

    // Stage 03 — Commit
    const commit = await pipeline.commit({
      agentEns: parsed.agentEns,
      inputHash: attest.inputHash,
      decision: reasoning.output,
      proposedAction: reasoning.output,
      attestation: reasoning.attestation,
    });

    // Stage 04 — Execute
    await pipeline.execute(parsed.agentEns, commit.commitmentHash);

    const myPeerId = await axl.getPeerId().catch(() => "unknown");

    const result: TaskResult = {
      type: "sail.result",
      from: myPeerId,
      taskId,
      commitmentHash: commit.commitmentHash,
      cid: commit.cid,
      txHash: commit.txHash,
      output: reasoning.output,
      model: reasoning.model,
      verified: reasoning.verified ?? null,
      timestamp: Date.now(),
    };

    processedTasks.set(taskId, { task: parsed, result });

    // Send result back
    await axl.sendMessage({
      to: msg.from,
      message: JSON.stringify(result),
      topic: parsed.replyTopic || "sail.result",
    });

    console.log(`[TaskRouter] task ${taskId} completed. commitment=${commit.commitmentHash.slice(0, 16)}…`);
  } catch (e) {
    const errorMsg = (e as Error).message ?? String(e);
    console.error(`[TaskRouter] task ${taskId} failed:`, errorMsg);

    processedTasks.set(taskId, { task: parsed, error: errorMsg });

    // Send error back
    try {
      const myPeerId = await axl.getPeerId().catch(() => "unknown");
      const errPayload: TaskError = {
        type: "sail.error",
        from: myPeerId,
        taskId,
        error: errorMsg,
        timestamp: Date.now(),
      };
      await axl.sendMessage({
        to: msg.from,
        message: JSON.stringify(errPayload),
        topic: "sail.error",
      });
    } catch {
      // best effort
    }
  }
}

// ---------------------------------------------------------------------------
// Hiring side — delegate tasks and track results
// ---------------------------------------------------------------------------

/**
 * Delegate a task to a worker agent via AXL.
 */
export async function delegateTask(
  workerPeerId: string,
  workerEns: string,
  task: string,
  context?: unknown,
): Promise<DelegationRecord> {
  const id = randomUUID();
  const myPeerId = await axl.getPeerId().catch(() => "unknown");

  const payload: TaskMessage = {
    type: "sail.task",
    from: myPeerId,
    taskId: id,
    task,
    context,
    agentEns: workerEns, // worker commits under its own ENS, not the hiring agent's
    replyTopic: "sail.result",
    timestamp: Date.now(),
  };

  await axl.sendMessage({
    to: workerPeerId,
    message: JSON.stringify(payload),
    topic: "sail.task",
  });

  const record: DelegationRecord = {
    id,
    workerEns,
    workerPeerId,
    task,
    context,
    sentAt: Date.now(),
    status: "pending",
  };

  delegations.set(id, record);
  console.log(`[TaskRouter] delegated task ${id} to ${workerEns} (${workerPeerId.slice(0, 16)}…)`);
  return record;
}

/**
 * Process incoming result/error messages and update delegation records.
 */
function processIncomingResults(messages: axl.ReceivedMessage[]): void {
  for (const msg of messages) {
    try {
      const parsed = JSON.parse(msg.message);
      if (parsed.type === "sail.result" && parsed.taskId) {
        const delegation = delegations.get(parsed.taskId);
        if (delegation) {
          delegation.status = "completed";
          delegation.result = parsed as TaskResult;
          console.log(`[TaskRouter] delegation ${parsed.taskId} completed`);
        }
      } else if (parsed.type === "sail.error" && parsed.taskId) {
        const delegation = delegations.get(parsed.taskId);
        if (delegation) {
          delegation.status = "failed";
          delegation.error = parsed.error;
          console.log(`[TaskRouter] delegation ${parsed.taskId} failed: ${parsed.error}`);
        }
      }
    } catch {
      // not a structured message — skip
    }
  }
}

// ---------------------------------------------------------------------------
// Background poller
// ---------------------------------------------------------------------------

async function pollAndRoute(): Promise<void> {
  try {
    const alive = await axl.isAlive();
    if (!alive) return;

    const messages = await axl.receiveMessages(lastPollTimestamp || undefined);
    if (!messages.length) return;

    lastPollTimestamp = Math.max(...messages.map((m) => m.timestamp), lastPollTimestamp);

    // Route task messages to the worker handler
    const taskMessages = messages.filter((m) => {
      try {
        const p = JSON.parse(m.message);
        return p.type === "sail.task";
      } catch {
        return false;
      }
    });

    // Route result/error messages to the delegation tracker
    const resultMessages = messages.filter((m) => {
      try {
        const p = JSON.parse(m.message);
        return p.type === "sail.result" || p.type === "sail.error";
      } catch {
        return false;
      }
    });

    processIncomingResults(resultMessages);

    // Process tasks sequentially to avoid nonce conflicts
    for (const msg of taskMessages) {
      await processIncomingTask(msg);
    }
  } catch (e) {
    // non-fatal — will retry next interval
    console.warn("[TaskRouter] poll error:", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Start the background task router (polls AXL inbox every 3s). */
export function startTaskRouter(intervalMs = 3000): void {
  if (pollHandle) return;
  console.log("[TaskRouter] started — polling every", intervalMs, "ms");
  pollHandle = setInterval(pollAndRoute, intervalMs);
}

/** Stop the background task router. */
export function stopTaskRouter(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
    console.log("[TaskRouter] stopped");
  }
}

/** Get all delegations (for the frontend). */
export function getDelegations(): DelegationRecord[] {
  return Array.from(delegations.values()).sort((a, b) => b.sentAt - a.sentAt);
}

/** Get a single delegation by ID. */
export function getDelegation(id: string): DelegationRecord | undefined {
  return delegations.get(id);
}

/** Get all processed tasks (worker side). */
export function getProcessedTasks() {
  return Array.from(processedTasks.entries()).map(([id, v]) => ({
    taskId: id,
    from: v.task.from,
    task: v.task.task,
    status: v.result ? "completed" : v.error ? "failed" : "processing",
    result: v.result,
    error: v.error,
  }));
}
