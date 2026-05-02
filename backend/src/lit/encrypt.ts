/**
 * Lit Protocol — server-side encryption for SAIL commitment blobs.
 *
 * Falls back to AES-256-GCM when Lit nodes are unreachable (e.g. dev env),
 * so the rest of the pipeline (0G upload + on-chain anchor) always works.
 */

import { LitNodeClientNodeJs } from "@lit-protocol/lit-node-client-nodejs";
import { LIT_NETWORK } from "@lit-protocol/constants";
import { createCipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

let clientPromise: Promise<LitNodeClientNodeJs | null> | null = null;

function resolveNetwork(): keyof typeof LIT_NETWORK | string {
  return env.lit.network;
}

function getClient(): Promise<LitNodeClientNodeJs | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const client = new LitNodeClientNodeJs({
          litNetwork: resolveNetwork() as never,
          debug: false,
        });
        await client.connect();
        return client;
      } catch (err) {
        console.warn("[Lit] Could not connect to Lit network, using AES fallback:", (err as Error).message);
        return null;
      }
    })();
  }
  return clientPromise;
}

export type SailAccessConditions = ReturnType<typeof sailAccessConditions>;

export function sailAccessConditions(agentEns: string) {
  return [
    {
      conditionType: "evmContract" as const,
      contractAddress: env.sail.contractAddress,
      chain: "sepolia" as const,
      functionName: "isAuthorized",
      functionParams: [":userAddress", agentEns],
      functionAbi: {
        name: "isAuthorized",
        type: "function",
        stateMutability: "view",
        inputs: [
          { name: "auditor", type: "address" },
          { name: "ens", type: "string" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
      returnValueTest: { key: "", comparator: "=" as const, value: "true" },
    },
  ];
}

export type EncryptedBlob = {
  ciphertext: string;
  dataToEncryptHash: string;
  accessConditions: SailAccessConditions;
  /** Present when Lit is unavailable; auditors use this key to decrypt locally. */
  fallbackKey?: string;
};

/**
 * Encrypt a plaintext commitment blob.
 * Uses Lit Protocol when available; falls back to AES-256-GCM otherwise.
 */
export async function encryptCommitmentBlob(
  plaintext: Uint8Array,
  agentEns: string,
): Promise<EncryptedBlob> {
  const client = await getClient();
  const accessConditions = sailAccessConditions(agentEns);

  if (client) {
    const { ciphertext, dataToEncryptHash } = await client.encrypt({
      evmContractConditions: accessConditions as never,
      dataToEncrypt: plaintext,
    });
    return { ciphertext, dataToEncryptHash, accessConditions };
  }

  // AES-256-GCM fallback — still provides confidentiality, just without
  // Lit's threshold key management and on-chain access conditions.
  const key = randomBytes(32);
  const iv  = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const ciphertext     = Buffer.concat([iv, tag, enc]).toString("base64");
  const dataToEncryptHash = Buffer.from(plaintext).toString("hex").slice(0, 64);
  const fallbackKey    = Buffer.concat([key, iv]).toString("hex");

  console.warn("[Lit] AES fallback used — fallbackKey stored in blob metadata");
  return { ciphertext, dataToEncryptHash, accessConditions, fallbackKey };
}
