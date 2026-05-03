/**
 * SAIL pipeline orchestrator.
 *
 * Glues the six pipeline stages together:
 *   01 Attest  → SHA256(inputs)
 *   02 Reason  → optional 0G Compute sealed inference (tier 1)
 *   03 Commit  → Lit encrypt → 0G Storage upload → SAIL contract anchor
 *   04 Execute → SAIL contract gate (reverts if no commitment)
 *   05 Deliver → out of scope for v1
 *   06 Audit   → Lit decrypt (handled in frontend) + hash compare
 */

import { createHash } from "node:crypto";
import { keccak256, toHex, type Hex } from "viem";
import * as contract from "../contract/sail.js";
import * as storage from "../../0g/storage.js";
import * as compute from "../../0g/compute.js";
import {
  chipotleDecrypt,
  decryptAesFallbackBlob,
  encryptCommitmentBlob,
} from "../lit/encrypt.js";
import { env } from "../config/env.js";
import type { Address } from "viem";

/** Semantic tier names (on-chain remains uint8 0..2). `zk` kept as legacy alias for tier 1. */
export type Tier = "optimistic" | "zk" | "sealed" | "tee";

function sha256(data: Uint8Array | string): Hex {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);
  const hex = createHash("sha256").update(buf).digest("hex");
  return `0x${hex}` as Hex;
}

// -------------------------------------------------------------------------
// Stage 01 — Attest
// -------------------------------------------------------------------------

export type AttestResult = {
  inputHash: Hex;
  timestamp: number;
};

export function attestInputs(inputs: unknown): AttestResult {
  const canonical = typeof inputs === "string" ? inputs : JSON.stringify(inputs);
  return {
    inputHash: sha256(canonical),
    timestamp: Date.now(),
  };
}

// -------------------------------------------------------------------------
// Stage 02 — Reason (sealed inference / tier 1)
// -------------------------------------------------------------------------

export type ReasonResult = {
  output: string;
  attestation?: string;
  verified: boolean | null;
  model: string;
  providerAddress: string;
};

export async function reason(prompt: string, systemPrompt?: string): Promise<ReasonResult> {
  const r = await compute.runSealedInference(prompt, systemPrompt);
  return {
    output: r.output,
    attestation: r.attestation,
    verified: r.verified,
    model: r.model,
    providerAddress: r.providerAddress,
  };
}

// -------------------------------------------------------------------------
// Stage 03 — Commit
// -------------------------------------------------------------------------

export type CommitInput = {
  agentEns: string;
  inputHash: Hex;
  decision: string;
  proposedAction: string;
  /** Optional sealed-inference attestation, embedded in the blob for tier 1. */
  attestation?: string;
  /**
   * Optional verbatim audit payload (user prompt, tool traces, constraints) stored inside the
   * encrypted blob so auditors can see what was attested, not only inputHash.
   */
  auditContext?: unknown;
};

export type CommitResult = {
  commitmentHash: Hex;
  cid: string;
  nonce: bigint;
  txHash: Hex;
  /** Plaintext blob bytes — the auditor will decrypt and re-hash these to verify. */
  plaintext: Uint8Array;
};

export async function commit(input: CommitInput): Promise<CommitResult> {
  const blob = {
    inputHash: input.inputHash,
    decision: input.decision,
    proposedAction: input.proposedAction,
    attestation: input.attestation,
    agentEns: input.agentEns,
    timestamp: Date.now(),
    ...(input.auditContext !== undefined ? { auditContext: input.auditContext } : {}),
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(blob));

  // Hash the plaintext — this is what auditors compare against the on-chain anchor.
  const commitmentHash = keccak256(toHex(plaintext));

  // Encrypt with Lit (access conditions tied to SAIL contract).
  const encrypted = await encryptCommitmentBlob(plaintext, input.agentEns);

  // Upload encrypted blob to 0G Storage Log.
  const wire: Record<string, unknown> = {
    ciphertext: encrypted.ciphertext,
    dataToEncryptHash: encrypted.dataToEncryptHash,
    accessConditions: encrypted.accessConditions,
    encryptionMethod: encrypted.encryptionMethod ?? "aes-fallback",
  };
  if (encrypted.fallbackKey) wire["fallbackKey"] = encrypted.fallbackKey;
  if (encrypted.fallbackCiphertext) wire["fallbackCiphertext"] = encrypted.fallbackCiphertext;
  const wireBlob = new TextEncoder().encode(JSON.stringify(wire));
  const cid = await storage.uploadBlob(wireBlob);

  // Anchor on-chain.
  const txHash = await contract.commit(input.agentEns, commitmentHash, input.inputHash, cid);
  await contract.waitForReceipt(txHash);

  const nonce = await contract.getNonce(input.agentEns);

  return { commitmentHash, cid, nonce, txHash, plaintext };
}

// -------------------------------------------------------------------------
// Stage 04 — Execute
// -------------------------------------------------------------------------

export type ExecuteResult = {
  txHash: Hex;
  commitmentHash: Hex;
};

export async function execute(agentEns: string, commitmentHash: Hex): Promise<ExecuteResult> {
  const txHash = await contract.execute(agentEns, commitmentHash);
  await contract.waitForReceipt(txHash);
  return { txHash, commitmentHash };
}

// -------------------------------------------------------------------------
// Audit helpers
// -------------------------------------------------------------------------

export type EncryptedSealedBlob = {
  ciphertext: string;
  dataToEncryptHash: string;
  accessConditions: { agentEns?: string; contractAddress?: string } | unknown;
  fallbackKey?: string;
  /** AES ciphertext paired with fallbackKey — separate from Chipotle ciphertext */
  fallbackCiphertext?: string;
  encryptionMethod?: string;
};

/**
 * Fetch the encrypted commitment blob for an auditor to decrypt.
 * Auditor performs the decrypt browser-side via Lit.
 */
export async function getSealedBlob(cid: string): Promise<EncryptedSealedBlob> {
  const bytes = await storage.downloadBlob(cid);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as EncryptedSealedBlob;
}

export type AuditCommitmentResult = {
  commitmentHash: Hex;
  onChain: {
    inputHash: Hex;
    cid: string;
    nonce: string;
    timestamp: string;
    executed: boolean;
  };
  /** How plaintext was recovered, if at all */
  decryptMode: "aes-fallback" | "chipotle" | "lit-required" | "none";
  /** Parsed commitment blob when decryptMode === "aes-fallback" */
  plaintext?: {
    inputHash: string;
    decision: string;
    proposedAction: string;
    attestation?: string;
    agentEns: string;
    timestamp: number;
    auditContext?: unknown;
  };
  hashVerified: boolean;
  note?: string;
};

/**
 * Auditor path: read on-chain commitment, fetch 0G blob, decrypt and verify keccak256(plaintext) === commitmentHash.
 * - AES fallback: decrypt with embedded key (demo path).
 * - Lit Chipotle: decrypt server-side when LIT_CHIPOTLE_* is configured (same PKP that encrypted).
 * Otherwise returns lit-required for browser-side Lit decrypt.
 */
export async function auditCommitment(
  commitmentHash: Hex,
  options?: { auditorAddress?: Address },
): Promise<AuditCommitmentResult> {
  const c = await contract.getCommitment(commitmentHash);
  if (c.commitmentHash !== commitmentHash) {
    throw new Error("Commitment not found on-chain");
  }

  const sealed = await getSealedBlob(c.cid);
  const base: AuditCommitmentResult = {
    commitmentHash,
    onChain: {
      inputHash: c.inputHash,
      cid: c.cid,
      nonce: c.nonce.toString(),
      timestamp: c.timestamp.toString(),
      executed: c.executed,
    },
    decryptMode: "none",
    hashVerified: false,
  };

  function finalizeVerifiedPlaintext(
    plainBytes: Uint8Array,
    mode: "aes-fallback" | "chipotle",
  ): AuditCommitmentResult {
    const expected = keccak256(toHex(plainBytes));
    const parsed = JSON.parse(new TextDecoder().decode(plainBytes)) as AuditCommitmentResult["plaintext"];
    const hashVerified = expected.toLowerCase() === commitmentHash.toLowerCase();
    const anchorOk = hashMatchesOnChainAnchor(parsed, c.inputHash);
    return {
      ...base,
      decryptMode: mode,
      plaintext: parsed,
      hashVerified,
      note: !hashVerified
        ? "Decrypted plaintext keccak256 does not match commitmentHash — blob may be tampered or wrong hash passed."
        : anchorOk
          ? "Commitment hash verified (keccak256(plaintext)). Plaintext inputHash matches on-chain inputHash."
          : "Commitment hash verified. Plaintext inputHash differs from on-chain anchor — inspect manually.",
    };
  }

  const ac = sealed.accessConditions as { agentEns?: string } | undefined;
  const agentEns = ac?.agentEns?.trim();
  if (
    sealed.ciphertext &&
    env.lit.chipotleApiKey &&
    env.lit.chipotlePkpId &&
    agentEns
  ) {
    // Authorization pre-check via viem (callContract inside Lit Actions hangs in Chipotle v3).
    if (options?.auditorAddress) {
      const authorized = await contract.isAuthorized(options.auditorAddress, agentEns).catch(() => false);
      if (!authorized) {
        return {
          ...base,
          decryptMode: "none",
          hashVerified: false,
          note: `Auditor ${options.auditorAddress} is not authorized for ${agentEns} (SAIL.isAuthorized returned false).`,
        };
      }
    }
    try {
      const plainBytes = await chipotleDecrypt(
        sealed.ciphertext,
        agentEns,
        options?.auditorAddress,
      );
      return finalizeVerifiedPlaintext(plainBytes, "chipotle");
    } catch (err) {
      // Chipotle failed — fall through to AES fallback if the blob has one.
      console.warn(`[Audit] Chipotle decrypt failed: ${(err as Error).message}. Trying AES fallback…`);
    }
  }

  // AES fallback — use fallbackCiphertext (AES) not ciphertext (Chipotle)
  const aesCipher = sealed.fallbackCiphertext ?? (sealed.encryptionMethod === "aes-fallback" ? sealed.ciphertext : undefined);
  if (sealed.fallbackKey && aesCipher) {
    const plainBytes = decryptAesFallbackBlob(aesCipher, sealed.fallbackKey);
    return finalizeVerifiedPlaintext(plainBytes, "aes-fallback");
  }

  if (sealed.ciphertext && (!env.lit.chipotleApiKey || !env.lit.chipotlePkpId)) {
    return {
      ...base,
      decryptMode: "lit-required",
      note:
        "Blob is Lit (Chipotle) encrypted and this server has no LIT_CHIPOTLE_API_KEY / LIT_CHIPOTLE_PKP_ID — cannot verify hash here. Configure Chipotle credentials (same as encrypt) or decrypt in a Lit-capable auditor client; keccak256(utf8(JSON plaintext)) must equal commitmentHash.",
    };
  }

  return {
    ...base,
    decryptMode: "lit-required",
    note:
      "Could not decrypt sealed blob (missing ciphertext, agentEns in accessConditions, or unsupported format). For Lit blobs, decrypt with accessConditions then verify keccak256(plaintext utf-8) === commitmentHash.",
  };
}

function hashMatchesOnChainAnchor(
  parsed: AuditCommitmentResult["plaintext"] | undefined,
  onChainInput: Hex,
): boolean {
  if (!parsed?.inputHash) return false;
  return String(parsed.inputHash).toLowerCase() === String(onChainInput).toLowerCase();
}
