/**
 * Sessionless tool dispatch — same behavior as MCP tools, for clients that cannot hold Mcp-Session-Id
 * (e.g. serverless agents, multi-replica HTTP without sticky sessions).
 *
 * POST /api/mcp/invoke
 * Body: { "tool": "sail_think_with_sail", "arguments": { ... } }
 * Auth: same as Streamable MCP (Bearer or X-SAIL-MCP-Token when MCP_HTTP_TOKEN is set).
 */

import { Router, type Request, type Response } from "express";
import { env } from "../config/env.js";
import { mcpHttpAuthOkExpress } from "../mcp/mcp-auth.js";
import { invokeSailMcpTool, listSailMcpToolNames } from "../mcp/tool-runners.js";

export const mcpInvokeRoutes = Router();

mcpInvokeRoutes.post("/invoke", async (req: Request, res: Response) => {
  if (!env.mcpHttp.invokeEnabled) {
    res.status(404).json({ error: "MCP HTTP invoke is disabled (MCP_HTTP_INVOKE=false)" });
    return;
  }
  if (!mcpHttpAuthOkExpress(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = req.body as { tool?: string; arguments?: Record<string, unknown> } | null;
  const tool = body?.tool?.trim();
  const arguments_ = body?.arguments;
  if (!tool) {
    res.status(400).json({
      error: "Expected JSON body: { \"tool\": \"sail_think_with_sail\", \"arguments\": { ... } }",
      knownTools: listSailMcpToolNames(),
    });
    return;
  }

  const result = await invokeSailMcpTool(tool, arguments_ && typeof arguments_ === "object" ? arguments_ : {});
  const text = result.content[0]?.type === "text" ? result.content[0].text : JSON.stringify(result.content);
  if (result.isError) {
    try {
      const parsed = JSON.parse(text) as { error?: string };
      res.status(400).json({ tool, ...parsed, raw: text });
    } catch {
      res.status(400).json({ tool, error: text });
    }
    return;
  }

  try {
    res.json({ tool, result: JSON.parse(text) });
  } catch {
    res.json({ tool, result: text });
  }
});

mcpInvokeRoutes.get("/tools", (_req: Request, res: Response) => {
  if (!env.mcpHttp.invokeEnabled) {
    res.status(404).json({ error: "MCP HTTP invoke is disabled" });
    return;
  }
  res.json({ tools: listSailMcpToolNames() });
});
