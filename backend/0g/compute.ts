/**
 * 0G Compute Network adapter.
 *
 * Used for the SAIL ZK trust tier — agents route their reasoning through
 * 0G Compute's sealed inference. The returned attestation proves which model
 * ran on which inputs, and the attestation is included in the SAIL commitment blob.
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
  createZGComputeNetworkBroker: (signer: ethers.Signer) => Promise<ZGBroker>;
};

type ZGBroker = {
  inference: {
    listService: () => Promise<unknown[]>;
    getServiceMetadata: (provider: string) => Promise<{ endpoint: string; model: string }>;
    getRequestHeaders: (provider: string, content: string) => Promise<Record<string, string>>;
    acknowledgeProviderSigner: (provider: string) => Promise<void>;
    processResponse: (provider: string, content: string, chatId?: string) => Promise<unknown>;
  };
};

let brokerPromise: Promise<ZGBroker> | null = null;

function getBroker(): Promise<ZGBroker> {
  if (!brokerPromise) {
    const provider = new ethers.JsonRpcProvider(env.zeroG.rpcUrl);
    const signer = new ethers.Wallet(env.zeroG.privateKey, provider);
    brokerPromise = computeSdk.createZGComputeNetworkBroker(signer);
  }
  return brokerPromise;
}

export type InferenceResult = {
  output: string;
  model: string;
  endpoint: string;
  providerAddress: string;
  /** Verifiability proof returned by the sealed inference TEE. */
  attestation?: string;
  raw: unknown;
};

/**
 * List all currently-available inference providers on 0G Compute.
 * Useful for picking a ZERO_G_COMPUTE_PROVIDER value.
 */
export async function listInferenceProviders() {
  const broker = await getBroker();
  return broker.inference.listService();
}

/**
 * Run sealed inference on a chosen provider.
 * The returned attestation should be embedded in the SAIL commitment blob
 * so auditors can verify reasoning integrity for ZK-tier agents.
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
  const chatId = json?.id;

  let attestation: string | undefined;
  try {
    const verified = await broker.inference.processResponse(providerAddress, output, chatId);
    attestation = typeof verified === "string" ? verified : JSON.stringify(verified);
  } catch (err) {
    attestation = undefined;
  }

  return {
    output,
    model,
    endpoint,
    providerAddress,
    attestation,
    raw: json,
  };
}
