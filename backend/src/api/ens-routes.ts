import { Router } from "express";
import * as ens from "../../ens/registry.js";

export const ensRoutes = Router();

/** GET /api/ens/resolve/:name — read SAIL text records for an ENS name */
ensRoutes.get("/resolve/:name", async (req, res) => {
  try {
    const records = await ens.resolveAgentRecords(req.params.name);
    res.json({ ensName: req.params.name, records });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/ens/owns/:name — check if operator wallet owns this name */
ensRoutes.get("/owns/:name", async (req, res) => {
  try {
    const owns = await ens.ownsName(req.params.name);
    res.json({ ensName: req.params.name, owns });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * POST /api/ens/register
 * Body: { parentName, subLabel, records, walletAddr? }
 * Registers a subdomain under parentName and writes text records.
 * The operator wallet must own parentName.
 */
ensRoutes.post("/register", async (req, res) => {
  try {
    const { parentName, subLabel, records, walletAddr } = req.body ?? {};
    if (!parentName || !subLabel || !records) {
      return res.status(400).json({ error: "parentName, subLabel, records required" });
    }
    const result = await ens.registerAgentSubname(parentName, subLabel, records, walletAddr);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
