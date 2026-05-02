/**
 * SAIL pipeline orchestrator.
 *
 * Glues the six pipeline stages together:
 *   01 Attest  → SHA256(inputs)
 *   02 Reason  → optional 0G Compute sealed inference (ZK tier)
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
import { decryptAesFallbackBlob, encryptCommitmentBlob } from "../lit/encrypt.js";

export type Tier = "optimistic" | "zk" | "tee";

function tierIndex(t: Tier): 0 | 1 | 2 {
  return t === "optimistic" ? 0 : t === "zk" ? 1 : 2;
}

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
// Stage 02 — Reason (ZK tier)
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
  /** Optional sealed-inference attestation, embedded in the blob for ZK tier. */
  attestation?: string;
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
  accessConditions: unknown;
  /** Present for AES fallback blobs — allows server-side audit decrypt (demo path). */
  fallbackKey?: string;
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
  decryptMode: "aes-fallback" | "lit-required" | "none";
  /** Parsed commitment blob when decryptMode === "aes-fallback" */
  plaintext?: {
    inputHash: string;
    decision: string;
    proposedAction: string;
    attestation?: string;
    agentEns: string;
    timestamp: number;
  };
  hashVerified: boolean;
  note?: string;
};

/**
 * Auditor path: read on-chain commitment, fetch 0G blob, decrypt when AES fallback key is present.
 * Lit-encrypted blobs return metadata only; decrypt with Lit in an auditor client.
 */
export async function auditCommitment(commitmentHash: Hex): Promise<AuditCommitmentResult> {
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

  if (sealed.fallbackKey && sealed.ciphertext) {
    const plainBytes = decryptAesFallbackBlob(sealed.ciphertext, sealed.fallbackKey);
    const expected = keccak256(toHex(plainBytes));
    const parsed = JSON.parse(new TextDecoder().decode(plainBytes)) as AuditCommitmentResult["plaintext"];
    return {
      ...base,
      decryptMode: "aes-fallback",
      plaintext: parsed,
      hashVerified: expected.toLowerCase() === commitmentHash.toLowerCase(),
      note: hashMatchesOnChainAnchor(parsed, c.inputHash)
        ? "Plaintext inputHash field matches on-chain inputHash."
        : "Plaintext blob inputHash differs from on-chain anchor — inspect manually.",
    };
  }

  return {
    ...base,
    decryptMode: "lit-required",
    note:
      "Blob is Lit-encrypted. Decrypt with a Lit client using accessConditions; then keccak256(utf8(JSON)) should match commitmentHash.",
  };
}

function hashMatchesOnChainAnchor(
  parsed: AuditCommitmentResult["plaintext"] | undefined,
  onChainInput: Hex,
): boolean {
  if (!parsed?.inputHash) return false;
  return String(parsed.inputHash).toLowerCase() === String(onChainInput).toLowerCase();
}
