/**
 * Decrypt a Lit (Chipotle) commitment blob as an on-chain auditor.
 *
 * Requires the same Chipotle credentials used at encrypt time:
 *   LIT_CHIPOTLE_API_KEY, LIT_CHIPOTLE_PKP_ID
 *
 * Usage:
 *   cd backend && DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/decrypt-commitment-auditor.ts <commitmentHash> [auditorAddress]
 *
 * If auditorAddress is omitted, uses the operator wallet from OPERATOR_PRIVATE_KEY (must be in agents[ens].auditors).
 */

import type { Address, Hex } from "viem";
import * as contract from "../contract/sail.js";
import * as pipeline from "../api/pipeline.js";
import { chipotleDecrypt } from "../lit/encrypt.js";

const commitmentHash = (process.argv[2] ?? "").trim() as Hex;
const auditorArg = (process.argv[3] ?? "").trim();

if (!commitmentHash.startsWith("0x") || commitmentHash.length !== 66) {
  console.error("Usage: npx tsx src/scripts/decrypt-commitment-auditor.ts 0x<commitmentHash> [auditorAddress]");
  process.exit(1);
}

const auditor: Address = (
  auditorArg && auditorArg.startsWith("0x") ? auditorArg : contract.operatorAddress
) as Address;

async function main() {
  const c = await contract.getCommitment(commitmentHash);
  if (c.commitmentHash !== commitmentHash) {
    throw new Error("Commitment not found");
  }

  const sealed = await pipeline.getSealedBlob(c.cid);
  const encMethod = (sealed as { encryptionMethod?: string }).encryptionMethod;
  if (encMethod === "aes-fallback" || sealed.fallbackKey) {
    console.log("Blob uses AES fallback — use GET /api/audit/:hash or decryptAesFallbackBlob instead.");
    process.exit(1);
  }

  const agentEns = (sealed.accessConditions as { agentEns?: string })?.agentEns;
  if (!agentEns || typeof agentEns !== "string") {
    throw new Error("Sealed blob missing accessConditions.agentEns");
  }

  const ok = await contract.isAuthorized(auditor, agentEns);
  if (!ok) {
    throw new Error(`Address ${auditor} is not an authorized auditor for ${agentEns}`);
  }

  console.log("Auditor:", auditor);
  console.log("agentEns:", agentEns);
  console.log("Decrypting via Chipotle…");

  const plain = await chipotleDecrypt(sealed.ciphertext, agentEns, auditor);
  const text = new TextDecoder().decode(plain);
  const parsed = JSON.parse(text) as Record<string, unknown>;
  console.log("\n--- plaintext JSON ---\n");
  console.log(JSON.stringify(parsed, null, 2));

  const { keccak256, toHex } = await import("viem");
  const recomputed = keccak256(toHex(plain));
  const match = recomputed.toLowerCase() === commitmentHash.toLowerCase();
  console.log("\nkeccak256(plaintext) === commitmentHash:", match);
  if (!match) {
    console.log("expected:", commitmentHash);
    console.log("got:     ", recomputed);
  }
}

main().catch((e) => {
  console.error("❌", (e as Error).message);
  process.exit(1);
});
