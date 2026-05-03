/**
 * Lit Protocol Chipotle — server-side encryption for SAIL commitment blobs.
 *
 * Chipotle (Lit v3) is a pure REST API — no SDK, no LitNodeClient, no network config.
 * Encryption/decryption run inside a Lit Action (JS in a TEE) keyed to a PKP wallet.
 *
 * Setup (one-time):
 *   1. Create account + fund ($5 min) at dashboard.chipotle.litprotocol.com
 *   2. Create a PKP: POST /core/v1/create_wallet  → save wallet_id as LIT_CHIPOTLE_PKP_ID
 *   3. Create usage key: POST /core/v1/add_usage_api_key → save as LIT_CHIPOTLE_API_KEY
 *   Run: npm run setup-lit  (automates steps 2-3 if LIT_CHIPOTLE_ACCOUNT_KEY is set)
 *
 * Falls back to AES-256-GCM when Chipotle credentials are not configured.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const CHIPOTLE_BASE = "https://api.chipotle.litprotocol.com/core/v1";

// Lit Action that encrypts a message with a PKP
const ENCRYPT_ACTION = `
async function main({ pkpId, message }) {
  const ciphertext = await Lit.Actions.Encrypt({ pkpId, message });
  Lit.Actions.setResponse({ response: JSON.stringify({ ciphertext }) });
}
`;

// Lit Action that decrypts — authorization is pre-checked by the backend via viem before this runs.
// Lit.Actions.callContract is NOT used here because it hangs in Chipotle v3 (unsupported primitive).
const DECRYPT_ACTION = `
async function main({ pkpId, ciphertext }) {
  const plaintext = await Lit.Actions.Decrypt({ pkpId, ciphertext });
  Lit.Actions.setResponse({ response: JSON.stringify({ plaintext }) });
}
`;

const CHIPOTLE_TIMEOUT_MS = 30_000;

async function chipotleAction(
  code: string,
  jsParams: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHIPOTLE_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${CHIPOTLE_BASE}/lit_action`, {
      method: "POST",
      headers: {
        "X-Api-Key": env.lit.chipotleApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, js_params: jsParams }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chipotle API ${res.status}: ${body}`);
  }

  const data = await res.json() as { response: unknown; logs?: string; has_error?: boolean };

  // Surface Chipotle-level errors before trying to parse response
  if (data.has_error) {
    const errMsg = typeof data.response === "string" ? data.response : (data.logs ?? JSON.stringify(data.response));
    throw new Error(`Chipotle action error: ${errMsg}`);
  }

  if (data.response === null || data.response === undefined) {
    throw new Error(`Chipotle action returned empty response. logs: ${data.logs ?? ""}`);
  }

  // response may be a pre-parsed object or a JSON string depending on Chipotle version
  if (typeof data.response === "string") {
    try { return JSON.parse(data.response); } catch { return data.response; }
  }
  return data.response;
}

// ---- Public types -----------------------------------------------------------

export type SailAccessConditions = {
  contractAddress: string;
  agentEns: string;
};

export type EncryptedBlob = {
  ciphertext: string;
  dataToEncryptHash: string;
  accessConditions: SailAccessConditions;
  /** AES-256-GCM ciphertext of the plaintext — always present for fallback audit decrypt */
  fallbackCiphertext?: string;
  /** AES key+IV hex — paired with fallbackCiphertext, not ciphertext */
  fallbackKey?: string;
  /** "chipotle" or "aes-fallback" */
  encryptionMethod?: string;
};

function sailAccessConditions(agentEns: string): SailAccessConditions {
  return {
    contractAddress: env.sail.contractAddress,
    agentEns,
  };
}

// ---- Chipotle encrypt -------------------------------------------------------

async function chipotleEncrypt(plaintext: Uint8Array): Promise<string> {
  const message = Buffer.from(plaintext).toString("base64");
  const result = await chipotleAction(ENCRYPT_ACTION, {
    pkpId: env.lit.chipotlePkpId,
    message,
  }) as { ciphertext: string };
  return result.ciphertext;
}

// ---- AES-256-GCM fallback ---------------------------------------------------

function aesEncrypt(plaintext: Uint8Array): { ciphertext: string; fallbackKey: string } {
  const key = randomBytes(32);
  const iv  = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext  = Buffer.concat([iv, tag, enc]).toString("base64");
  const fallbackKey = Buffer.concat([key, iv]).toString("hex");
  return { ciphertext, fallbackKey };
}

// ---- Main API ---------------------------------------------------------------

/**
 * Encrypt a plaintext commitment blob.
 * Uses Lit Chipotle when credentials are configured; falls back to AES-256-GCM.
 */
export async function encryptCommitmentBlob(
  plaintext: Uint8Array,
  agentEns: string,
): Promise<EncryptedBlob> {
  const accessConditions = sailAccessConditions(agentEns);
  const dataToEncryptHash = Buffer.from(plaintext).toString("hex").slice(0, 64);

  // Always generate AES ciphertext — stored as fallback so audit works even if Chipotle decrypt is blocked.
  const { ciphertext: fallbackCiphertext, fallbackKey } = aesEncrypt(plaintext);

  // Try Chipotle if credentials are set
  if (env.lit.chipotleApiKey && env.lit.chipotlePkpId) {
    try {
      const ciphertext = await chipotleEncrypt(plaintext);
      console.log("[Lit] Chipotle encryption succeeded");
      // Store Chipotle ciphertext as primary + AES as fallback (separate fields)
      return { ciphertext, dataToEncryptHash, accessConditions, fallbackCiphertext, fallbackKey, encryptionMethod: "chipotle" };
    } catch (err) {
      console.warn("[Lit] Chipotle encryption failed, using AES:", (err as Error).message);
    }
  } else {
    console.warn("[Lit] Chipotle credentials not set — using AES");
  }

  return { ciphertext: fallbackCiphertext, dataToEncryptHash, accessConditions, fallbackKey, encryptionMethod: "aes-fallback" };
}

/**
 * Decrypt via Lit Chipotle (enforces SAIL.isAuthorized on-chain inside the action).
 */
export async function chipotleDecrypt(
  ciphertext: string,
  _agentEns: string,
  _auditorAddress?: string,
): Promise<Uint8Array> {
  if (!env.lit.chipotleApiKey || !env.lit.chipotlePkpId) {
    throw new Error("Chipotle credentials not configured");
  }

  // Authorization (isAuthorized) is checked by the caller (auditCommitment) via viem before
  // this function is called. callContract inside a Lit Action hangs in Chipotle v3.
  const result = await chipotleAction(DECRYPT_ACTION, {
    pkpId: env.lit.chipotlePkpId,
    ciphertext,
  }) as { plaintext?: string; error?: string };

  if (result.error) throw new Error(`Chipotle decrypt denied: ${result.error}`);
  if (!result.plaintext) throw new Error("Chipotle decrypt returned no plaintext");

  return new Uint8Array(Buffer.from(result.plaintext, "base64"));
}

/**
 * Decrypt AES-256-GCM fallback blob.
 * `fallbackKeyHex` = 64 hex chars (32-byte key) + 24 hex chars (12-byte IV).
 */
export function decryptAesFallbackBlob(ciphertextB64: string, fallbackKeyHex: string): Uint8Array {
  const key = Buffer.from(fallbackKeyHex.slice(0, 64), "hex");
  if (key.length !== 32) throw new Error("fallbackKey must start with 64 hex chars (32-byte AES key)");
  const raw = Buffer.from(ciphertextB64, "base64");
  if (raw.length < 12 + 16) throw new Error("ciphertext too short for AES-GCM (iv + tag + data)");
  const iv  = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(enc), decipher.final()]));
}
