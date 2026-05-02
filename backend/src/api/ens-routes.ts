import { Router } from "express";
import * as ens from "../../ens/registry.js";
import { env } from "../config/env.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export const ensRoutes = Router();

/** GET /api/ens/config — return the configured parent ENS name and operator address */
ensRoutes.get("/config", (_req, res) => {
  const operatorAddress = env.sail.operatorKey
    ? privateKeyToAccount(
        (env.sail.operatorKey.startsWith("0x")
          ? env.sail.operatorKey
          : `0x${env.sail.operatorKey}`) as Hex,
      ).address
    : null;
  res.json({
    parentName: env.ens.parentName || "sail.eth",
    operatorAddress,
  });
});

/** GET /api/ens/resolve/:name — read SAIL text records for an ENS name */
ensRoutes.get("/resolve/:name", async (req, res) => {
  try {
    const records = await ens.resolveAgentRecords(req.params.name);
    res.json({ ensName: req.params.name, records });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/ens/owns/:name — check if operator wallet owns this name (checks NameWrapper too) */
ensRoutes.get("/owns/:name", async (req, res) => {
  try {
    const owns = await ens.ownsName(req.params.name);
    const owner = await ens.getOwner(req.params.name);
    res.json({
      ensName: req.params.name,
      owns,
      owner,
      operatorAddress: env.sail.operatorKey
        ? privateKeyToAccount(
            (env.sail.operatorKey.startsWith("0x")
              ? env.sail.operatorKey
              : `0x${env.sail.operatorKey}`) as Hex,
          ).address
        : null,
    });
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
    const { subLabel, records, walletAddr } = req.body ?? {};
    const parentName: string = req.body?.parentName || env.ens.parentName || "sail.eth";
    if (!subLabel || !records) {
      return res.status(400).json({ error: "subLabel and records required" });
    }
    const result = await ens.registerAgentSubname(parentName, subLabel, records, walletAddr);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
