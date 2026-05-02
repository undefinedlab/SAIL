/**
 * SAIL backend entrypoint.
 *
 * Boots an Express HTTP server for the frontend dashboards.
 * Run `npm run mcp` separately to expose SAIL tools via the MCP protocol
 * for agent frameworks (LangChain, CrewAI, ElizaOS, OpenClaw, Claude).
 */

import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { api } from "./api/routes.js";
import { ensRoutes } from "./api/ens-routes.js";
import { axlRoutes } from "./api/axl-routes.js";
import { SAIL_ADDRESS, operatorAddress } from "./contract/sail.js";
import { startAxlNode } from "../gensyn/node.js";
import { isAlive as axlAlive } from "../gensyn/client.js";
import { startTaskRouter } from "../gensyn/task-router.js";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: env.server.corsOrigin === "*" ? true : env.server.corsOrigin }));

app.get("/health", async (_req, res) => {
  const axl = await axlAlive().catch(() => false);
  res.json({
    ok: true,
    contract: SAIL_ADDRESS,
    operator: operatorAddress,
    chainId: env.sail.chainId,
    axl: { online: axl, bridgeUrl: env.axl.bridgeUrl },
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
  // Optionally auto-start AXL binary if configured
  if (env.axl.autoStart) {
    console.log("[AXL] auto-start enabled — starting node…");
    await startAxlNode().catch((e) =>
      console.warn("[AXL] auto-start failed (non-fatal):", (e as Error).message),
    );
  } else {
    const alive = await axlAlive().catch(() => false);
    console.log(`[AXL] bridge at ${env.axl.bridgeUrl} — ${alive ? "online" : "offline (start manually)"}`);
    if (alive) startTaskRouter();
  }

  app.listen(env.server.port, env.server.host, () => {
    console.log(`\nSAIL backend  http://${env.server.host}:${env.server.port}`);
    console.log(`  Contract    ${SAIL_ADDRESS}`);
    console.log(`  Operator    ${operatorAddress}`);
    console.log(`  Chain ID    ${env.sail.chainId}`);
    console.log(`  Lit net     ${env.lit.network}`);
    console.log(`  AXL bridge  ${env.axl.bridgeUrl}`);
    console.log(`\n  MCP server  run: npm run mcp`);
  });
}

boot().catch((e) => {
  console.error("[boot]", e);
  process.exit(1);
});
