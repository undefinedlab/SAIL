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
async function inferOnProvider(
  broker: ZGBroker,
  providerAddress: string,
  prompt: string,
  systemPrompt?: string,
): Promise<InferenceResult> {
  // Ensure provider is acknowledged (idempotent).
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  } catch {
    // Already acknowledged — fine.
  }

  // Ensure sub-account is funded via auto-funding (starts background top-ups).
  try {
    await broker.inference.startAutoFunding(providerAddress);
  } catch {
    // Auto-funding not supported or already running — continue.
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
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ messages, model }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`0G inference ${res.status}: ${text}`);
  }

  const json = await res.json();
  const output = json?.choices?.[0]?.message?.content ?? "";
  const chatId: string | undefined = json?.id;

  let verified: boolean | null = null;
  let teeError: string | undefined;
  let attestation: string | undefined;
  try {
    const usageContent = json?.usage ? JSON.stringify(json.usage) : undefined;
    verified = await broker.inference.processResponse(providerAddress, chatId, usageContent) ?? null;
    if (verified === true) {
      attestation = JSON.stringify({
        kind: "0g_tee",
        verified: true,
        chatId,
        provider: providerAddress,
      });
    } else if (verified === false) {
      console.warn(`[0G] TEE verification returned false for chatId=${chatId} — provider may not implement signatures`);
    }
  } catch (err) {
    // Provider doesn't support signature storage (testnet limitation) — inference result is still valid
    teeError = (err as Error).message;
    console.warn(`[0G] TEE verification threw (provider-side): ${teeError}`);
    verified = null;
  }

  /** When the SDK/TEE path yields no proof (common on testnet), still anchor output binding in the commitment blob. */
  if (!attestation) {
    const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
    attestation = JSON.stringify({
      kind: "0g_compute_receipt_v1",
      teeVerified: verified === true,
      teeVerificationNote:
        verified === true
          ? "unexpected: tee path should have set kind 0g_tee"
          : teeError
            ? `processResponse failed: ${teeError}`
            : verified === false
              ? "processResponse returned false — no provider signature"
              : "no TEE proof on this network run — receipt binds output hash only",
      chatId: chatId ?? null,
      provider: providerAddress,
      model,
      endpoint,
      outputHash,
      usage: json?.usage ?? null,
    });
  }

  return { output, model, endpoint, providerAddress, attestation, verified, raw: json };
}

/**
 * Run sealed inference — tries the configured provider first, then auto-picks
 * from the network if that fails, so compute always works as long as any
 * provider is live on the 0G testnet.
 */
export async function runSealedInference(
  prompt: string,
  systemPrompt?: string,
  providerAddress: string = env.zeroG.computeProvider,
): Promise<InferenceResult> {
  const broker = await getBroker();

  // 1. Try the configured provider.
  if (providerAddress && ethers.isAddress(providerAddress)) {
    try {
      return await inferOnProvider(broker, providerAddress, prompt, systemPrompt);
    } catch (err) {
      console.warn(`[0G] configured provider ${providerAddress.slice(0, 10)}… failed: ${(err as Error).message}. Trying others…`);
    }
  }

  // 2. Auto-pick from live providers and try each in turn.
  const services = await broker.inference.listService();
  if (services.length === 0) {
    throw new Error("No 0G Compute providers available on the network.");
  }

  // Prefer acknowledged providers first.
  const sorted = [
    ...services.filter((s) => s.teeSignerAcknowledged),
    ...services.filter((s) => !s.teeSignerAcknowledged),
  ];

  const errors: string[] = [];
  for (const svc of sorted) {
    try {
      console.log(`[0G] trying provider ${svc.provider.slice(0, 10)}… (${svc.model})`);
      const result = await inferOnProvider(broker, svc.provider, prompt, systemPrompt);
      // Log the working provider so the operator can update ZERO_G_COMPUTE_PROVIDER.
      console.log(`[0G] working provider found: ${svc.provider}`);
      return result;
    } catch (err) {
      errors.push(`${svc.provider.slice(0, 10)}: ${(err as Error).message}`);
    }
  }

  throw new Error(`All 0G Compute providers failed:\n${errors.join("\n")}`);
}
