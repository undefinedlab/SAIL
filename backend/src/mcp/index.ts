/**
 * MCP server entrypoint.
 * Connects via stdio (default) for use with Claude Desktop, Claude CLI,
 * LangChain MCP adapters, CrewAI, ElizaOS, and OpenClaw.
 */
import { startMcpServer } from "./server.js";

startMcpServer().catch((e) => {
  console.error("[MCP] fatal:", e);
  process.exit(1);
});
