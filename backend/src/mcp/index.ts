/**
 * MCP server entrypoint.
 *
 * - Default / stdio: Claude Desktop, local Cursor (`command` + `cwd`)
 * - MCP_TRANSPORT=http: Streamable HTTP for Cursor `url` (remote or localhost)
 */
import { startMcpHttpServer } from "./http-server.js";
import { startMcpServer } from "./server.js";

const mode = process.env["MCP_TRANSPORT"]?.toLowerCase();
const start = mode === "http" || mode === "streamable" ? startMcpHttpServer : startMcpServer;

start().catch((e) => {
  console.error("[MCP] fatal:", e);
  process.exit(1);
});
