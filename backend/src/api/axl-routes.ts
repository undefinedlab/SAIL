import { Router } from "express";
import * as axl from "../../gensyn/client.js";
import * as ens from "../../ens/registry.js";
import * as taskRouter from "../../gensyn/task-router.js";
import { SAIL_ADDRESS } from "../contract/sail.js";
import * as contract from "../contract/sail.js";

export const axlRoutes = Router();

// -------------------------------------------------------------------------
// Core AXL — status, send, recv
// -------------------------------------------------------------------------

/** GET /api/axl/status — AXL node health + peer topology */
axlRoutes.get("/status", async (_req, res) => {
  try {
    const alive = await axl.isAlive();
    if (!alive) return res.json({ online: false });
    const topology = await axl.getTopology();
    res.json({ online: true, ...topology });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/axl/send — send a message to a peer */
axlRoutes.post("/send", async (req, res) => {
  try {
    const { to, message, topic } = req.body ?? {};
    if (!to || !message) return res.status(400).json({ error: "to, message required" });
    await axl.sendMessage({ to, message, topic });
    res.json({ sent: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/axl/recv — poll inbox */
axlRoutes.get("/recv", async (req, res) => {
  try {
    const since = req.query.since ? Number(req.query.since) : undefined;
    const messages = await axl.receiveMessages(since);
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// -------------------------------------------------------------------------
// Agent discovery — resolve ENS → agent capabilities + AXL peer ID
// -------------------------------------------------------------------------

/**
 * GET /api/axl/discover/:ensName
 * Resolve an agent's ENS records + on-chain SAIL registration.
 * Returns everything needed to decide whether to delegate.
 */
axlRoutes.get("/discover/:ensName", async (req, res) => {
  try {
    const ensName = req.params.ensName;
    const records = await ens.resolveAgentRecords(ensName);

    // Also try to fetch on-chain agent info
    let agent: Record<string, unknown> | null = null;
    try {
      const raw = await contract.getAgent(ensName);
      agent = {
        wallet: raw.wallet,
        stake: raw.stake.toString(),
        tier: raw.tier,
        active: raw.active,
        auditors: raw.auditors,
        commitmentCount: raw.commitmentCount.toString(),
        slashCount: raw.slashCount.toString(),
      };
    } catch {
      // agent not registered on SAIL contract — that's fine
    }

    res.json({
      ensName,
      records,
      agent,
      sailContract: SAIL_ADDRESS,
      reachable: !!records.axl_peer_id,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// -------------------------------------------------------------------------
// Delegation — send task to worker agent, track results
// -------------------------------------------------------------------------

/**
 * POST /api/axl/delegate
 * Body: { workerEns, task, context?, agentEns }
 * Resolves worker ENS → AXL peer ID, sends sail.task, returns delegation ID.
 */
axlRoutes.post("/delegate", async (req, res) => {
  try {
    const { workerEns, task, context, agentEns } = req.body ?? {};
    if (!workerEns || !task || !agentEns) {
      return res.status(400).json({ error: "workerEns, task, agentEns required" });
    }

    // Resolve worker's AXL peer ID from ENS
    const records = await ens.resolveAgentRecords(workerEns);
    const peerId = records.axl_peer_id;
    if (!peerId) {
      return res.status(400).json({
        error: `No axl_peer_id found for ${workerEns}. The worker must be registered with SAIL and have an AXL peer ID set.`,
        records,
      });
    }

    const alive = await axl.isAlive();
    if (!alive) {
      return res.status(503).json({ error: "AXL node is offline" });
    }

    const delegation = await taskRouter.delegateTask(
      peerId,
      workerEns,
      agentEns,
      task,
      context,
    );

    res.json(delegation);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/axl/delegations — list all outbound delegations */
axlRoutes.get("/delegations", (_req, res) => {
  res.json({ delegations: taskRouter.getDelegations() });
});

/** GET /api/axl/delegations/:id — get a single delegation by ID */
axlRoutes.get("/delegations/:id", (req, res) => {
  const d = taskRouter.getDelegation(req.params.id);
  if (!d) return res.status(404).json({ error: "delegation not found" });
  res.json(d);
});

/** GET /api/axl/tasks — list tasks this node has processed (worker side) */
axlRoutes.get("/tasks", (_req, res) => {
  res.json({ tasks: taskRouter.getProcessedTasks() });
});

// -------------------------------------------------------------------------
// Task router control
// -------------------------------------------------------------------------

/** POST /api/axl/router/start — start the background task router */
axlRoutes.post("/router/start", (_req, res) => {
  taskRouter.startTaskRouter();
  res.json({ started: true });
});

/** POST /api/axl/router/stop — stop the background task router */
axlRoutes.post("/router/stop", (_req, res) => {
  taskRouter.stopTaskRouter();
  res.json({ stopped: true });
});
