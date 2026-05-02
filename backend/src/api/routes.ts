/**
 * SAIL HTTP API.
 * Endpoints consumed by the frontend dashboards.
 */

import { Router, type Request, type Response } from "express";
import type { Hex } from "viem";
import * as pipeline from "./pipeline.js";
import * as contract from "../contract/sail.js";
import * as compute from "../../0g/compute.js";

export const api = Router();

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

/** Extract the SAIL__ custom error name from a viem revert, or fall back to the raw message. */
function contractError(err: unknown): string {
  const msg = (err as Error).message ?? String(err);
  const match = msg.match(/Error:\s*(SAIL__\w+)\s*\(/);
  if (match) return match[1];
  // viem sometimes puts it as "reverted with the following reason:\nSAIL__Foo"
  const reason = msg.match(/reason:\s*(SAIL__\w+)/);
  if (reason) return reason[1];
  return msg.split("\n")[0]; // first line only, drop the ABI call dump
}

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

api.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    contract: contract.SAIL_ADDRESS,
    operator: contract.operatorAddress,
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

api.get("/agents/:ens", async (req, res) => {
  try {
    const agent = await contract.getAgent(req.params.ens);
    const nonce = await contract.getNonce(req.params.ens);
    res.json(jsonSafe({ agent, nonce }));
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

api.get("/commitments/:hash", async (req, res) => {
  try {
    const commitment = await contract.getCommitment(req.params.hash as Hex);
    res.json(jsonSafe({ commitment }));
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// Register agent
// -------------------------------------------------------------------------

api.post("/register", async (req, res) => {
  try {
    const { ens, tier = 0, auditors, stakeEth = "0.01" } = req.body ?? {};
    if (!ens || !auditors?.length) {
      return res.status(400).json({ error: "ens and auditors[] required" });
    }
    const { ethers } = await import("ethers");
    const stakeWei = ethers.parseEther(String(stakeEth));
    const txHash = await contract.register(ens, tier as 0 | 1 | 2, auditors, stakeWei);
    await contract.waitForReceipt(txHash);
    const agent = await contract.getAgent(ens);
    res.json(jsonSafe({ txHash, ens, agent }));
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// Stage 01 — Attest
// -------------------------------------------------------------------------

api.post("/attest", (req, res) => {
  try {
    const result = pipeline.attestInputs(req.body?.inputs);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// Stage 02 — Reason (0G Compute)
// -------------------------------------------------------------------------

api.post("/reason", async (req, res) => {
  try {
    const { prompt, systemPrompt } = req.body ?? {};
    if (!prompt) return res.status(400).json({ error: "prompt required" });
    const result = await pipeline.reason(prompt, systemPrompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

api.get("/compute/providers", async (_req, res) => {
  try {
    const providers = await compute.listInferenceProviders();
    res.json(jsonSafe({ providers }));
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// Stage 03 — Commit (Lit + 0G Storage + SAIL)
// -------------------------------------------------------------------------

api.post("/commit", async (req, res) => {
  try {
    const { agentEns, inputHash, decision, proposedAction, attestation } = req.body ?? {};
    if (!agentEns || !inputHash || !decision || !proposedAction) {
      return res.status(400).json({ error: "agentEns, inputHash, decision, proposedAction required" });
    }
    const result = await pipeline.commit({
      agentEns,
      inputHash: inputHash as Hex,
      decision,
      proposedAction,
      attestation,
    });
    res.json({
      commitmentHash: result.commitmentHash,
      cid: result.cid,
      nonce: result.nonce.toString(),
      txHash: result.txHash,
    });
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// Stage 04 — Execute (SAIL contract gate)
// -------------------------------------------------------------------------

api.post("/execute", async (req, res) => {
  try {
    const { agentEns, commitmentHash } = req.body ?? {};
    if (!agentEns || !commitmentHash) {
      return res.status(400).json({ error: "agentEns, commitmentHash required" });
    }
    const result = await pipeline.execute(agentEns, commitmentHash as Hex);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// Stage 06 — Audit reveal (auditor fetches the encrypted blob)
// -------------------------------------------------------------------------

api.get("/reveal/:cid", async (req, res) => {
  try {
    const blob = await pipeline.getSealedBlob(req.params.cid);
    res.json(blob);
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});
