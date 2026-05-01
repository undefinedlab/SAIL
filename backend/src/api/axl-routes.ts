import { Router } from "express";
import * as axl from "../../gensyn/client.js";

export const axlRoutes = Router();

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
