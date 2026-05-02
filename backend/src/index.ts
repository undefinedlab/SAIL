/**
 * SAIL backend entrypoint.
 *
 * Boots an Express HTTP server for the frontend dashboards.
 * Streamable HTTP MCP is mounted at /mcp on this server (Cursor remote URL).
 * For stdio (local Cursor command), run `npm run mcp` separately.
 */

import express from "express";
import cors from "cors";
import { corsOriginOption, env } from "./config/env.js";
import { api } from "./api/routes.js";
import { ensRoutes } from "./api/ens-routes.js";
import { axlRoutes } from "./api/axl-routes.js";
import { SAIL_ADDRESS, operatorAddress } from "./contract/sail.js";
import { startAxlNode } from "../gensyn/node.js";
import { isAlive as axlAlive } from "../gensyn/client.js";
import { startTaskRouter } from "../gensyn/task-router.js";
import { registerSailMcpHttpRoutes, SAIL_MCP_HTTP_PATH } from "./mcp/http-server.js";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: corsOriginOption() }));

registerSailMcpHttpRoutes(app);

app.get("/health", async (_req, res) => {
  const axl = await axlAlive().catch(() => false);
  res.json({
    ok: true,
    contract: SAIL_ADDRESS,
    operator: operatorAddress,
    chainId: env.sail.chainId,
    axl: { online: axl, bridgeUrl: env.axl.bridgeUrl },
    mcp: { streamableHttp: SAIL_MCP_HTTP_PATH },
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", api);
app.use("/api/ens", ensRoutes);
app.use("/api/axl", axlRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: err.message ?? "internal error" });
});

async function boot() {
  const wantedAutoStart = (process.env["AXL_AUTO_START"] ?? "").trim() === "true";
  if (wantedAutoStart && process.env["NODE_ENV"] === "production" && !env.axl.autoStart) {
    console.warn(
      "[AXL] AXL_AUTO_START=true is ignored in production without AXL_AUTO_START_IN_PRODUCTION=true (needs Go 1.25+ at runtime). Use an external bridge or a custom image.",
    );
  }

  if (env.axl.autoStart) {
    console.log("[AXL] auto-start enabled — starting node…");
    await startAxlNode().catch((e) =>
      console.warn("[AXL] auto-start failed (non-fatal):", (e as Error).message),
    );
  }

  const alive = await axlAlive().catch(() => false);
  if (!env.axl.autoStart) {
    console.log(`[AXL] bridge at ${env.axl.bridgeUrl} — ${alive ? "online" : "offline (start manually)"}`);
  }
  if (alive) startTaskRouter();

  app.listen(env.server.port, env.server.host, () => {
    console.log(`\nSAIL backend  http://${env.server.host}:${env.server.port}`);
    console.log(`  Contract    ${SAIL_ADDRESS}`);
    console.log(`  Operator    ${operatorAddress}`);
    console.log(`  Chain ID    ${env.sail.chainId}`);
    console.log(`  Lit net     ${env.lit.network}`);
    console.log(`  AXL bridge  ${env.axl.bridgeUrl}`);
    console.log(`\n  MCP (HTTP)  same origin → /mcp   stdio local → npm run mcp`);
  });
}

boot().catch((e) => {
  console.error("[boot]", e);
  process.exit(1);
});
