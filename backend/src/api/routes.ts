/**
 * SAIL HTTP API.
 * Endpoints consumed by the frontend dashboards.
 */

import { Router, type Request, type Response } from "express";
import type { Hex } from "viem";
import * as pipeline from "./pipeline.js";
import * as contract from "../contract/sail.js";
import * as compute from "../../0g/compute.js";
import { registerEnsSubnameForAgentIfApplicable } from "./register-agent-shared.js";

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

api.get("/audit/:hash", async (req, res) => {
  try {
    const result = await pipeline.auditCommitment(req.params.hash as Hex);
    res.json(jsonSafe(result));
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// Register agent
// -------------------------------------------------------------------------

api.post("/register", async (req, res) => {
  try {
    const {
      ens,
      tier = 0,
      auditors,
      stakeEth = "0.01",
      skipEns = false,
      ensExtraRecords,
    } = req.body ?? {};
    if (!ens || !auditors?.length) {
      return res.status(400).json({ error: "ens and auditors[] required" });
    }
    const { ethers } = await import("ethers");
    const stakeWei = ethers.parseEther(String(stakeEth));

    // 1. Register with SAIL contract
    const txHash = await contract.register(ens, tier as 0 | 1 | 2, auditors, stakeWei);
    await contract.waitForReceipt(txHash);
    const agent = await contract.getAgent(ens);

    // 2. ENS subname + text records when ens is under configured parent (e.g. *.sail.eth)
    const ensSubnameResult = await registerEnsSubnameForAgentIfApplicable({
      ens,
      tier: tier as 0 | 1 | 2,
      auditors: auditors as string[],
      skipEns: Boolean(skipEns),
      ensExtraRecords:
        ensExtraRecords && typeof ensExtraRecords === "object" && !Array.isArray(ensExtraRecords)
          ? (ensExtraRecords as Record<string, string>)
          : undefined,
    });

    res.json(jsonSafe({ txHash, ens, agent, ensSubname: ensSubnameResult }));
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

api.get("/compute/providers", async (req, res) => {
  try {
    const modelHint = req.query.model as string | undefined;
    const providers = await compute.listInferenceProviders();
    const mapped = providers.map((p) => ({
      provider: p.provider,
      model: p.model,
      url: p.url,
      inputPrice: p.inputPrice?.toString(),
      outputPrice: p.outputPrice?.toString(),
      verifiability: p.verifiability,
      teeSignerAcknowledged: p.teeSignerAcknowledged,
    }));
    if (modelHint) {
      const hint = modelHint.toLowerCase();
      const filtered = mapped.filter((p) => p.model?.toLowerCase().includes(hint));
      return res.json({ providers: filtered, total: filtered.length });
    }
    res.json({ providers: mapped, total: mapped.length });
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

// -------------------------------------------------------------------------
// 0G Compute — Ledger management
// -------------------------------------------------------------------------

api.post("/compute/ledger/setup", async (req, res) => {
  try {
    const { amount = 1 } = req.body ?? {};
    const result = await compute.setupLedger(Number(amount));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

api.post("/compute/ledger/deposit", async (req, res) => {
  try {
    const { amount } = req.body ?? {};
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "amount required (in 0G tokens)" });
    }
    await compute.depositFund(Number(amount));
    res.json({ ok: true, deposited: Number(amount) });
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

api.get("/compute/ledger", async (_req, res) => {
  try {
    const raw = await compute.getLedger();
    // SDK returns a tuple [user, availableBalance, totalBalance, additionalInfo]
    // Normalize into a proper object for the frontend.
    const ledger = Array.isArray(raw)
      ? {
          user: String(raw[0] ?? ""),
          availableBalance: String(raw[1] ?? "0"),
          totalBalance: String(raw[2] ?? "0"),
          additionalInfo: String(raw[3] ?? ""),
        }
      : {
          user: String((raw as Record<string, unknown>).user ?? ""),
          availableBalance: String((raw as Record<string, unknown>).availableBalance ?? "0"),
          totalBalance: String((raw as Record<string, unknown>).totalBalance ?? "0"),
          additionalInfo: String((raw as Record<string, unknown>).additionalInfo ?? ""),
        };
    res.json({ ledger });
  } catch (err) {
    res.status(500).json({ error: contractError(err) });
  }
});

api.get("/compute/ledger/providers", async (_req, res) => {
  try {
    const providers = await compute.getProvidersWithBalance();
    const mapped = providers.map(([addr, balance, pending]) => ({
      provider: addr,
      balance: balance.toString(),
      pendingRefund: pending.toString(),
    }));
    res.json({ providers: mapped });
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
    console.error("[commit] error:", (err as Error).message ?? err);
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
