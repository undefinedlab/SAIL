/**
 * SAIL MCP over Streamable HTTP (MCP spec) for remote clients — e.g. Cursor `mcp.json` `url`.
 * One process serves many sessions; each `initialize` gets a dedicated McpServer + transport.
 *
 * Routes are registered on the main API app (Railway `npm start`) and optionally on a dedicated
 * listener via `startMcpHttpServer()` for local `mcp:http` on MCP_HTTP_PORT.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import express, { type Application, type Request, type Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../config/env.js";
import { createSailMcpServer } from "./server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const SAIL_MCP_HTTP_PATH =
  (process.env["MCP_HTTP_PATH"] ?? "/mcp").trim() || "/mcp";

type SessionRecord = {
  mcp: McpServer;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, SessionRecord>();

function bodyHasInitialize(body: unknown): boolean {
  if (body == null) return false;
  if (Array.isArray(body)) return body.some((m) => isInitializeRequest(m));
  return isInitializeRequest(body);
}

function authOk(req: IncomingMessage): boolean {
  const token = env.mcpHttp.token;
  if (!token) return true;
  const auth = req.headers.authorization;
  if (auth === `Bearer ${token}`) return true;
  const h = req.headers["x-sail-mcp-token"];
  return typeof h === "string" && h === token;
}

async function handleMcpStreamableHttp(req: Request, res: Response): Promise<void> {
  if (!authOk(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const rawSession = req.headers["mcp-session-id"];
  const sessionIdHeader = typeof rawSession === "string" ? rawSession : undefined;
  const parsedBody =
    req.method === "POST" && req.body && typeof req.body === "object" ? req.body : undefined;

  const nodeReq = req as IncomingMessage;
  const nodeRes = res as unknown as ServerResponse;

  if (req.method === "POST" && bodyHasInitialize(parsedBody) && !sessionIdHeader) {
    const mcp = createSailMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessionclosed: (sid) => {
        sessions.delete(sid);
      },
    });
    await mcp.connect(transport);
    await transport.handleRequest(nodeReq, nodeRes, parsedBody);
    const sid = transport.sessionId;
    if (sid) sessions.set(sid, { mcp, transport });
    return;
  }

  if (!sessionIdHeader || !sessions.has(sessionIdHeader)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Missing or unknown Mcp-Session-Id. Start with POST initialize (no session header), then reuse the returned session id.",
      },
      id: null,
    });
    return;
  }

  const record = sessions.get(sessionIdHeader)!;
  await record.transport.handleRequest(
    nodeReq,
    nodeRes,
    req.method === "POST" ? parsedBody : undefined,
  );
}

/**
 * Attach Streamable HTTP MCP to an existing Express app (same port as the REST API — e.g. Railway).
 */
export function registerSailMcpHttpRoutes(app: Application): void {
  const allowed = env.mcpHttp.allowedHosts;
  const router = express.Router();

  if (allowed.length > 0) {
    router.use(hostHeaderValidation(allowed));
  }

  router.use((req, res, next) => {
    void handleMcpStreamableHttp(req, res).catch(next);
  });

  app.use(SAIL_MCP_HTTP_PATH, router);
}

export async function startMcpHttpServer(): Promise<void> {
  const bindHost = env.server.host;
  const allowed = env.mcpHttp.allowedHosts;
  const app = createMcpExpressApp(
    allowed.length > 0 ? { host: bindHost, allowedHosts: allowed } : { host: bindHost },
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "sail-mcp" });
  });

  registerSailMcpHttpRoutes(app);

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(env.mcpHttp.port, bindHost, () => resolve());
    httpServer.on("error", reject);
  });

  const displayHost = bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost;
  console.error(
    `[MCP] SAIL Streamable HTTP → http://${displayHost}:${env.mcpHttp.port}${SAIL_MCP_HTTP_PATH} (set Cursor mcp.json url; use public host if remote)`,
  );
}
