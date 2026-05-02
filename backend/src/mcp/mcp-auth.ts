import type { IncomingMessage } from "node:http";
import type { Request } from "express";
import { env } from "../config/env.js";

/** Same rules as Streamable HTTP MCP: Bearer or X-SAIL-MCP-Token when MCP_HTTP_TOKEN is set. */
export function mcpHttpAuthOkHeaders(headers: IncomingMessage["headers"]): boolean {
  const token = env.mcpHttp.token;
  if (!token) return true;
  const auth = headers.authorization;
  if (auth === `Bearer ${token}`) return true;
  const h = headers["x-sail-mcp-token"];
  return typeof h === "string" && h === token;
}

export function mcpHttpAuthOkExpress(req: Request): boolean {
  return mcpHttpAuthOkHeaders(req.headers);
}
