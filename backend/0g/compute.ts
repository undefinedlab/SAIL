/**
 * 0G Compute Network adapter.
 *
 * Used for the SAIL ZK trust tier — agents route their reasoning through
 * 0G Compute's sealed inference. The returned attestation proves which model
 * ran on which inputs, and the attestation is included in the SAIL commitment blob.
 *
 * Full lifecycle:
 *   1. setupLedger(amount)         — one-time: create ledger & deposit 0G tokens
 *   2. listInferenceProviders()    — browse available models
 *   3. runSealedInference(prompt)  — acknowledge → fund sub-account → infer → verify
 *
 * The provider/model catalog is dynamic; pick a provider from
 * `broker.inference.listService()` and set ZERO_G_COMPUTE_PROVIDER in env.
 */

import { ethers } from "ethers";
import { createRequire } from "node:module";
import { env } from "../src/config/env.js";

// 0G compute SDK ships a broken ESM build (export 'C' missing); load via CJS.
const require = createRequire(import.meta.url);
const computeSdk = require("@0gfoundation/0g-compute-ts-sdk") as {
  createZGComputeNetworkBroker: (
    signer: ethers.Wallet | ethers.JsonRpcSigner,
    ledgerCA?: string,
    inferenceCA?: string,
    fineTuningCA?: string,
    gasPrice?: number,
    maxGasPrice?: number,
    step?: number,
  ) => Promise<ZGBroker>;
};

// ---------------------------------------------------------------------------
// SDK types (mirrored from @0gfoundation/0g-compute-ts-sdk .d.ts)
// ---------------------------------------------------------------------------

/** Service listing item returned by broker.inference.listService() */
export type ServiceInfo = {
  provider: string;
  serviceType: string;
  url: string;
  inputPrice: bigint;
  outputPrice: bigint;
  updatedAt: bigint;
  model: string;
  verifiability: string;
  additionalInfo: string;
  teeSignerAddress: string;
  teeSignerAcknowledged: boolean;
};

type LedgerInfo = {
  totalBalance: bigint;
  availableBalance: bigint;
  [key: string]: unknown;
};

type ZGBroker = {
  ledger: {
    addLedger: (balance: number, gasPrice?: number) => Promise<void>;
    getLedger: () => Promise<LedgerInfo>;
    depositFund: (amount: number, gasPrice?: number) => Promise<void>;
    refund: (amount: number, gasPrice?: number) => Promise<void>;
    transferFund: (provider: string, serviceType: "inference" | "fine-tuning", amount: bigint, gasPrice?: number) => Promise<void>;
    getProvidersWithBalance: (serviceType: "inference" | "fine-tuning") => Promise<[string, bigint, bigint][]>;
    retrieveFund: (serviceType: "inference" | "fine-tuning", gasPrice?: number) => Promise<void>;
    deleteLedger: (gasPrice?: number) => Promise<void>;
  };
  inference: {
    listService: (offset?: number, limit?: number, includeUnacknowledged?: boolean) => Promise<ServiceInfo[]>;
    getServiceMetadata: (provider: string) => Promise<{ endpoint: string; model: string }>;
    getRequestHeaders: (provider: string, content?: string) => Promise<Record<string, string>>;
    acknowledgeProviderSigner: (provider: string, gasPrice?: number) => Promise<void>;
    getAccount: (provider: string) => Promise<{ balance: bigint; pendingRefund: bigint; [key: string]: unknown }>;
    processResponse: (provider: string, chatID?: string, content?: string) => Promise<boolean | null>;
    startAutoFunding: (provider: string, config?: { interval?: number; bufferMultiplier?: number }, gasPrice?: number) => Promise<void>;
    stopAutoFunding: (provider?: string) => void;
  };
};

// ---------------------------------------------------------------------------
// Singleton broker
// ---------------------------------------------------------------------------

let brokerPromise: Promise<ZGBroker> | null = null;

function getBroker(): Promise<ZGBroker> {
  if (!brokerPromise) {
    const provider = new ethers.JsonRpcProvider(env.zeroG.rpcUrl);
    const signer = new ethers.Wallet(env.zeroG.privateKey, provider);
    brokerPromise = computeSdk.createZGComputeNetworkBroker(signer);
  }
  return brokerPromise;
}

/** Force-reset the cached broker (useful after ledger changes). */
export function resetBroker() {
  brokerPromise = null;
}

// ---------------------------------------------------------------------------
// Ledger management
// ---------------------------------------------------------------------------

/**
 * One-time setup: create a ledger and deposit `amount` 0G tokens.
 * If the ledger already exists, just tops up.
 */
export async function setupLedger(amount: number): Promise<{ action: "created" | "deposited"; amount: number }> {
  const broker = await getBroker();
  try {
    const existing = await broker.ledger.getLedger();
    if (existing) {
      await broker.ledger.depositFund(amount);
      return { action: "deposited", amount };
    }
  } catch {
    // ledger doesn't exist yet — create it
  }
  if (amount < 3) {
    throw new Error(
      `Minimum balance to create a ledger is 3 0G, but got ${amount} 0G. Please use: broker.ledger.addLedger(3)`,
    );
  }
  await broker.ledger.addLedger(amount);
  return { action: "created", amount };
}

/** Get current ledger balance info. */
export async function getLedger(): Promise<LedgerInfo> {
  const broker = await getBroker();
  return broker.ledger.getLedger();
}

/** Deposit additional 0G tokens into an existing ledger. */
export async function depositFund(amount: number): Promise<void> {
  const broker = await getBroker();
  await broker.ledger.depositFund(amount);
}

/** Refund (withdraw) 0G tokens from the ledger back to your wallet. */
export async function refund(amount: number): Promise<void> {
  const broker = await getBroker();
  await broker.ledger.refund(amount);
}

/** List providers you've funded with their balances. */
export async function getProvidersWithBalance(): Promise<[string, bigint, bigint][]> {
  const broker = await getBroker();
  return broker.ledger.getProvidersWithBalance("inference");
}

// ---------------------------------------------------------------------------
// Provider discovery
// ---------------------------------------------------------------------------

export type InferenceResult = {
  output: string;
  model: string;
  endpoint: string;
  providerAddress: string;
  /** Verifiability proof returned by the sealed inference TEE. */
  attestation?: string;
  verified: boolean | null;
  raw: unknown;
};

/**
 * List all currently-available inference providers on 0G Compute.
 * Returns rich ServiceInfo including model, pricing, verifiability.
 */
export async function listInferenceProviders(): Promise<ServiceInfo[]> {
  const broker = await getBroker();
  return broker.inference.listService();
}

/**
 * Auto-pick the best provider for a given model name (partial match).
 * Falls back to the first acknowledged provider if no model match.
 */
export async function pickProvider(modelHint?: string): Promise<ServiceInfo | null> {
  const services = await listInferenceProviders();
  if (services.length === 0) return null;

  if (modelHint) {
    const hint = modelHint.toLowerCase();
    const match = services.find((s) => s.model?.toLowerCase().includes(hint));
    if (match) return match;
  }

  // Prefer acknowledged providers
  const acknowledged = services.filter((s) => s.teeSignerAcknowledged);
  return acknowledged[0] ?? services[0];
}

// ---------------------------------------------------------------------------
// Sealed inference
// ---------------------------------------------------------------------------

/**
 * Run sealed inference on a chosen provider.
 * The returned attestation should be embedded in the SAIL commitment blob
 * so auditors can verify reasoning integrity for ZK-tier agents.
 *
 * Handles the full lifecycle: acknowledge → (auto-fund if needed) → infer → verify.
 */
export async function runSealedInference(
  prompt: string,
  systemPrompt?: string,
  providerAddress: string = env.zeroG.computeProvider,
): Promise<InferenceResult> {
  if (!providerAddress) {
    throw new Error("ZERO_G_COMPUTE_PROVIDER not set. Run listInferenceProviders() to pick one.");
  }
  if (!ethers.isAddress(providerAddress)) {
    throw new Error(
      `ZERO_G_COMPUTE_PROVIDER must be a valid Ethereum address (0x…), got: "${providerAddress}". ` +
      `Run listInferenceProviders() to see available providers.`,
    );
  }

  const broker = await getBroker();

  // Acknowledge provider (one-time per provider per signer; idempotent on retry).
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  } catch {
    // already acknowledged — safe to ignore
  }

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const messages = systemPrompt
    ? [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ]
    : [{ role: "user", content: prompt }];

  const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ messages, model }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`0G Compute inference failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const output = json?.choices?.[0]?.message?.content ?? "";
  const chatId: string | undefined = json?.id;

  // Verify response via TEE attestation.
  // SDK signature: processResponse(providerAddress, chatID?, content?)
  let verified: boolean | null = null;
  let attestation: string | undefined;
  try {
    const usageContent = json?.usage ? JSON.stringify(json.usage) : undefined;
    verified = await broker.inference.processResponse(providerAddress, chatId, usageContent);
    attestation = verified != null ? JSON.stringify({ verified, chatId }) : undefined;
  } catch {
    verified = null;
    attestation = undefined;
  }

  return {
    output,
    model,
    endpoint,
    providerAddress,
    attestation,
    verified,
    raw: json,
  };
}
