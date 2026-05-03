/**
 * In-memory agent task board — open gigs posted by registered SAIL agents.
 *
 * Storage is per backend process (lost on restart). For demos and MCP/agent flows;
 * a persistent index can replace this later without changing tool shapes.
 */

import { randomUUID } from "node:crypto";
import { getAddress, zeroAddress, type Address } from "viem";
import * as sailContract from "../contract/sail.js";

export type SailBoardTaskStatus = "open" | "claimed" | "cancelled";

export type SailBoardTask = {
  id: string;
  posterAgentEns: string;
  /** Short label for UIs (defaults from instruction if omitted at create). */
  title: string;
  /** Primary instruction / call to action for the worker agent. */
  instruction: string;
  /** Structured inputs (JSON-serialisable) — schemas, payloads, references. */
  inputs: unknown;
  createdAt: number;
  status: SailBoardTaskStatus;
  claimedByAgentEns?: string;
  claimedAt?: number;
};

const tasks = new Map<string, SailBoardTask>();
const MAX_TASKS = 500;

function normalizeEns(ens: string): string {
  return ens.trim();
}

function ensKey(a: string, b: string): boolean {
  return normalizeEns(a).toLowerCase() === normalizeEns(b).toLowerCase();
}

async function requireRegisteredActiveAgent(ens: string): Promise<void> {
  const name = normalizeEns(ens);
  if (!name) throw new Error("agent ENS required");
  const agent = await sailContract.getAgent(name);
  const a = agent as { wallet: Address; active: boolean };
  if (getAddress(a.wallet) === zeroAddress) {
    throw new Error(`Agent not registered on SAIL contract: ${name}`);
  }
  if (!a.active) {
    throw new Error(`Agent is inactive (slashed or deactivated): ${name}`);
  }
}

function pruneIfNeeded(): void {
  if (tasks.size < MAX_TASKS) return;
  for (const [id, t] of tasks) {
    if (t.status === "cancelled") tasks.delete(id);
  }
  if (tasks.size < MAX_TASKS) return;
  throw new Error(
    "Task board is at capacity on this server — wait or ask the operator to restart / add persistence.",
  );
}

export async function createOpenTask(input: {
  posterAgentEns: string;
  instruction: string;
  title?: string;
  inputs?: unknown;
}): Promise<SailBoardTask> {
  await requireRegisteredActiveAgent(input.posterAgentEns);

  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("instruction is required");

  pruneIfNeeded();

  const title =
    input.title?.trim() ||
    (instruction.length > 120 ? `${instruction.slice(0, 117)}…` : instruction);

  const id = randomUUID();
  const row: SailBoardTask = {
    id,
    posterAgentEns: normalizeEns(input.posterAgentEns),
    title,
    instruction,
    inputs: input.inputs ?? null,
    createdAt: Date.now(),
    status: "open",
  };
  tasks.set(id, row);
  return row;
}

export async function claimTask(input: { taskId: string; claimantAgentEns: string }): Promise<SailBoardTask> {
  const taskId = input.taskId.trim();
  const claimant = normalizeEns(input.claimantAgentEns);
  if (!taskId) throw new Error("taskId required");
  if (!claimant) throw new Error("claimantAgentEns required");

  await requireRegisteredActiveAgent(claimant);

  const row = tasks.get(taskId);
  if (!row) throw new Error(`Unknown task: ${taskId}`);
  if (row.status !== "open") {
    throw new Error(`Task is not open (status=${row.status})`);
  }
  if (ensKey(row.posterAgentEns, claimant)) {
    throw new Error("Cannot claim your own task");
  }

  row.status = "claimed";
  row.claimedByAgentEns = claimant;
  row.claimedAt = Date.now();
  return row;
}

export function getTask(taskId: string): SailBoardTask | undefined {
  return tasks.get(taskId.trim());
}

export function listOpenTasks(): SailBoardTask[] {
  return [...tasks.values()]
    .filter((t) => t.status === "open")
    .sort((a, b) => b.createdAt - a.createdAt);
}
