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

// Lit Action that decrypts — enforces SAIL.isAuthorized() before releasing plaintext
const DECRYPT_ACTION = `
async function main({ pkpId, ciphertext, agentEns, auditorAddress, contractAddress }) {
  if (agentEns && auditorAddress && contractAddress) {
    const isAuth = await Lit.Actions.callContract({
      chain: "sepolia",
      contractAddress,
      abi: [{
        name: "isAuthorized",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "auditor", type: "address" }, { name: "ens", type: "string" }],
        outputs: [{ name: "", type: "bool" }]
      }],
      functionName: "isAuthorized",
      args: [auditorAddress, agentEns]
    });
    if (!isAuth) {
      Lit.Actions.setResponse({ response: JSON.stringify({ error: "Not authorized" }) });
      return;
    }
  }
  const plaintext = await Lit.Actions.Decrypt({ pkpId, ciphertext });
  Lit.Actions.setResponse({ response: JSON.stringify({ plaintext }) });
}
`;

async function chipotleAction(
  code: string,
  jsParams: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${CHIPOTLE_BASE}/lit_action`, {
    method: "POST",
    headers: {
      "X-Api-Key": env.lit.chipotleApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, js_params: jsParams }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chipotle API ${res.status}: ${body}`);
  }

  const data = await res.json() as { response: unknown; logs?: string };
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
  /** Present when Chipotle is unavailable — used by AES fallback decrypt */
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

  // Try Chipotle if credentials are set
  if (env.lit.chipotleApiKey && env.lit.chipotlePkpId) {
    try {
      const ciphertext = await chipotleEncrypt(plaintext);
      console.log("[Lit] Chipotle encryption succeeded");
      return { ciphertext, dataToEncryptHash, accessConditions, encryptionMethod: "chipotle" };
    } catch (err) {
      console.warn("[Lit] Chipotle encryption failed, using AES fallback:", (err as Error).message);
    }
  } else {
    console.warn("[Lit] Chipotle credentials not set (LIT_CHIPOTLE_API_KEY / LIT_CHIPOTLE_PKP_ID) — using AES fallback");
  }

  // AES-256-GCM fallback
  const { ciphertext, fallbackKey } = aesEncrypt(plaintext);
  console.warn("[Lit] AES fallback used — fallbackKey stored in blob metadata");
  return { ciphertext, dataToEncryptHash, accessConditions, fallbackKey, encryptionMethod: "aes-fallback" };
}

/**
 * Decrypt via Lit Chipotle (enforces SAIL.isAuthorized on-chain inside the action).
 */
export async function chipotleDecrypt(
  ciphertext: string,
  agentEns: string,
  auditorAddress?: string,
): Promise<Uint8Array> {
  if (!env.lit.chipotleApiKey || !env.lit.chipotlePkpId) {
    throw new Error("Chipotle credentials not configured");
  }

  const result = await chipotleAction(DECRYPT_ACTION, {
    pkpId: env.lit.chipotlePkpId,
    ciphertext,
    agentEns,
    auditorAddress: auditorAddress ?? "",
    contractAddress: env.sail.contractAddress,
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
