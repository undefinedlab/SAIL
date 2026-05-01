/**
 * AXL HTTP client.
 *
 * AXL (Agent eXchange Layer) by Gensyn exposes a local HTTP bridge at
 * localhost:9002. Any language that can make HTTP requests can use it —
 * encryption, routing, and peer discovery are handled by the AXL binary.
 *
 * Endpoints used by SAIL:
 *   GET  /topology           → node's own peer ID + connected peers
 *   POST /send               → send encrypted message to a peer
 *   GET  /recv               → receive messages addressed to this node
 */

import { env } from "../src/config/env.js";

const BASE = env.axl.bridgeUrl.replace(/\/$/, "");

export type Topology = {
  peerId: string;
  address: string;
  peers: Array<{ peerId: string; address: string }>;
};

export type SendPayload = {
  /** Recipient peer ID obtained via ENS resolution */
  to: string;
  /** Arbitrary UTF-8 string (SAIL uses JSON-serialised task objects) */
  message: string;
  /** Optional topic for routing (e.g. "sail.task", "sail.result") */
  topic?: string;
};

export type ReceivedMessage = {
  from: string;
  message: string;
  topic?: string;
  timestamp: number;
};

async function axlFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AXL ${init?.method ?? "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Return this node's peer ID and connected peers. */
export async function getTopology(): Promise<Topology> {
  return axlFetch<Topology>("/topology");
}

/** Return this node's own peer ID. */
export async function getPeerId(): Promise<string> {
  const t = await getTopology();
  return t.peerId;
}

/**
 * Send an encrypted message to another AXL peer.
 * AXL handles encryption and routing transparently.
 */
export async function sendMessage(payload: SendPayload): Promise<void> {
  await axlFetch<void>("/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Poll for messages addressed to this node.
 * Returns all unread messages since last call (or since `since` timestamp).
 */
export async function receiveMessages(since?: number): Promise<ReceivedMessage[]> {
  const qs = since ? `?since=${since}` : "";
  return axlFetch<ReceivedMessage[]>(`/recv${qs}`);
}

/** Health check — returns true if the local AXL node is reachable. */
export async function isAlive(): Promise<boolean> {
  try {
    await getTopology();
    return true;
  } catch {
    return false;
  }
}
