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
import { encryptCommitmentBlob } from "../lit/encrypt.js";

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
  const wireBlob = new TextEncoder().encode(
    JSON.stringify({
      ciphertext: encrypted.ciphertext,
      dataToEncryptHash: encrypted.dataToEncryptHash,
      accessConditions: encrypted.accessConditions,
    }),
  );
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
