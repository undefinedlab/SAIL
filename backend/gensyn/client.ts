/**
 * AXL HTTP client aligned with the public gensyn-ai/axl bridge.
 *
 * Official bridge semantics:
 *   GET  /topology  -> JSON with our_public_key / our_ipv6 / peers / tree
 *   POST /send      -> raw body + X-Destination-Peer-Id header
 *   GET  /recv      -> 204 when empty, otherwise one raw message + X-From-Peer-Id
 *
 * We keep a tiny SAIL envelope on top of raw bytes so the rest of the app can
 * continue working with `topic` and `timestamp`.
 */

import { env } from "../src/config/env.js";

const BASE = env.axl.bridgeUrl.replace(/\/$/, "");
const MAX_RECV_BATCH = 50;
/** Avoid hanging forever when the AXL bridge or route to the peer is slow / unreachable. */
const SEND_TIMEOUT_MS = 45_000;
const RECV_SINGLE_TIMEOUT_MS = 12_000;

/** In-process stats for `/api/axl/recv` — confirms whether the bridge ever yields mail. */
export type RecvPollStats = {
  apiRecvCalls: number;
  lastApiRecvAt: string | null;
  lastBatchMessages: number;
  lastBridgeGets: number;
  totalMessagesReturned: number;
  emptyBatches: number;
};

let recvPollStats: RecvPollStats = {
  apiRecvCalls: 0,
  lastApiRecvAt: null,
  lastBatchMessages: 0,
  lastBridgeGets: 0,
  totalMessagesReturned: 0,
  emptyBatches: 0,
};

export function getRecvPollStats(): RecvPollStats {
  return { ...recvPollStats };
}

type RawTopology = {
  our_public_key: string;
  our_ipv6: string;
  peers: Array<{
    uri: string;
    up: boolean;
    inbound: boolean;
    public_key: string;
    root: string;
    port: number;
    coords: number[];
  }> | null;
  tree: Array<{
    public_key: string;
    parent: string;
    sequence: number;
  }> | null;
};

type SailEnvelope = {
  __sail_axl_envelope: true;
  message: string;
  topic?: string;
  timestamp: number;
};

export type Topology = {
  peerId: string;
  ipv6: string;
  peers: Array<{
    peerId: string;
    address: string;
    up: boolean;
    inbound: boolean;
  }>;
  tree: Array<{
    peerId: string;
    parent: string;
    sequence: number;
  }>;
};

export type SendPayload = {
  /** Recipient peer ID obtained via ENS resolution */
  to: string;
  /** Arbitrary UTF-8 string (SAIL uses JSON-serialised task objects) */
  message: string;
  /** Optional application-level topic stored inside the SAIL envelope */
  topic?: string;
};

export type ReceivedMessage = {
  from: string;
  message: string;
  topic?: string;
  timestamp: number;
};

function decodeJson<T>(text: string, fallbackLabel: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`${fallbackLabel} returned invalid JSON: ${(error as Error).message}`);
  }
}

function encodeEnvelope(payload: SendPayload): Uint8Array {
  const envelope: SailEnvelope = {
    __sail_axl_envelope: true,
    message: payload.message,
    topic: payload.topic,
    timestamp: Date.now(),
  };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

function decodeEnvelope(bytes: Uint8Array): {
  message: string;
  topic?: string;
  timestamp: number;
} {
  const text = new TextDecoder().decode(bytes);

  try {
    const parsed = JSON.parse(text) as Partial<SailEnvelope>;
    if (parsed.__sail_axl_envelope === true && typeof parsed.message === "string") {
      return {
        message: parsed.message,
        topic: parsed.topic,
        timestamp:
          typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
      };
    }
  } catch {
    // Not a SAIL envelope — treat it as an opaque text payload.
  }

  return { message: text, timestamp: Date.now() };
}

async function axlJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AXL GET ${path} -> ${res.status}: ${body}`);
  }
  return decodeJson<T>(await res.text(), path);
}

async function axlSendRaw(path: string, body: Uint8Array, headers: HeadersInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: Buffer.from(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
}

function normalizeTopology(raw: RawTopology): Topology {
  const peers = raw.peers ?? [];
  const tree = raw.tree ?? [];

  return {
    peerId: raw.our_public_key,
    ipv6: raw.our_ipv6,
    peers: peers.map((peer) => ({
      peerId: peer.public_key,
      address: peer.uri,
      up: peer.up,
      inbound: peer.inbound,
    })),
    tree: tree.map((node) => ({
      peerId: node.public_key,
      parent: node.parent,
      sequence: node.sequence,
    })),
  };
}

/** Return this node's peer ID, IPv6 address, and connected peers. */
export async function getTopology(): Promise<Topology> {
  const raw = await axlJson<RawTopology>("/topology");
  return normalizeTopology(raw);
}

/** Return this node's own peer ID. */
export async function getPeerId(): Promise<string> {
  const topology = await getTopology();
  return topology.peerId;
}

/**
 * Send a message to another AXL peer.
 * Transport is raw bytes; we keep topic/timestamp inside a tiny JSON envelope.
 */
export async function sendMessage(payload: SendPayload): Promise<void> {
  try {
    const res = await axlSendRaw("/send", encodeEnvelope(payload), {
      "Content-Type": "application/octet-stream",
      "X-Destination-Peer-Id": payload.to,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AXL POST /send -> ${res.status}: ${body}`);
    }
  } catch (e) {
    if (isAbortLike(e)) {
      throw new Error(
        `AXL POST /send timed out after ${SEND_TIMEOUT_MS / 1000}s — bridge unreachable or peer not responding. Check AXL bridge URL, that the AXL node is running, and the destination peer id.`,
      );
    }
    throw e;
  }
}

function isAbortLike(err: unknown): boolean {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

/**
 * Poll for inbound messages.
 * The real bridge dequeues one message per GET /recv, so we batch locally.
 */
export async function receiveMessages(since?: number): Promise<ReceivedMessage[]> {
  const messages: ReceivedMessage[] = [];
  let bridgeGets = 0;

  for (let i = 0; i < MAX_RECV_BATCH; i += 1) {
    bridgeGets += 1;
    let res: Response;
    try {
      res = await fetch(`${BASE}/recv`, { signal: AbortSignal.timeout(RECV_SINGLE_TIMEOUT_MS) });
    } catch (e) {
      if (isAbortLike(e)) break;
      throw e;
    }
    if (res.status === 204) {
      break;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AXL GET /recv -> ${res.status}: ${body}`);
    }

    const from = res.headers.get("X-From-Peer-Id") ?? "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    const decoded = decodeEnvelope(bytes);

    if (!since || decoded.timestamp > since) {
      messages.push({
        from,
        message: decoded.message,
        topic: decoded.topic,
        timestamp: decoded.timestamp,
      });
    }
  }

  recvPollStats.apiRecvCalls += 1;
  recvPollStats.lastApiRecvAt = new Date().toISOString();
  recvPollStats.lastBatchMessages = messages.length;
  recvPollStats.lastBridgeGets = bridgeGets;
  recvPollStats.totalMessagesReturned += messages.length;
  if (messages.length === 0) recvPollStats.emptyBatches += 1;

  return messages;
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
