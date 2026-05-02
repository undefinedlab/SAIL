/**
 * AXL mock bridge — simulates the AXL HTTP bridge at localhost:9002.
 *
 * The real AXL binary (gensyn-ai/axl) has no public release yet.
 * This mock implements the same HTTP API so the full SAIL delegation
 * flow works in the demo:
 *   GET  /topology → peer ID + connected peers
 *   POST /send     → queue message
 *   GET  /recv     → drain inbox (supports ?since=<ms>)
 *
 * Messages are in-memory (not P2P encrypted), but the SAIL pipeline
 * and task-router run exactly as they would with the real binary.
 */

import http from "node:http";
import { randomBytes } from "node:crypto";

// Stable peer ID for this node (libp2p-style)
const PEER_ID = `12D3KooW${randomBytes(16).toString("hex").slice(0, 32)}`;

type Message = {
  from: string;
  to: string;
  message: string;
  topic?: string;
  timestamp: number;
};

const inbox: Message[] = [];
let server: http.Server | null = null;

function respond(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

export function startMockBridge(port = 9002): Promise<void> {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (req.method === "GET" && url.pathname === "/topology") {
        return respond(res, 200, {
          peerId: PEER_ID,
          address: `/ip4/127.0.0.1/tcp/0/p2p/${PEER_ID}`,
          peers: [],
        });
      }

      if (req.method === "POST" && url.pathname === "/send") {
        const body = await readBody(req);
        const payload = JSON.parse(body) as { to: string; message: string; topic?: string };
        inbox.push({
          from: PEER_ID,
          to: payload.to,
          message: payload.message,
          topic: payload.topic,
          timestamp: Date.now(),
        });
        return respond(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/recv") {
        const since = Number(url.searchParams.get("since") ?? "0");
        const msgs = inbox.filter((m) => m.timestamp > since && m.to === PEER_ID);
        return respond(res, 200, msgs);
      }

      respond(res, 404, { error: "not found" });
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      console.log(`[AXL mock] bridge running on localhost:${port} — peerId: ${PEER_ID.slice(0, 20)}…`);
      resolve();
    });
  });
}

export function stopMockBridge(): void {
  server?.close();
  server = null;
}

export function getMockPeerId(): string {
  return PEER_ID;
}
