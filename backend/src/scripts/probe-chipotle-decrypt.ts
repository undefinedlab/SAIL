/**
 * Minimal Chipotle / Lit decrypt smoke test — calls chipotleDecrypt only (no full audit pipeline).
 *
 *   cd backend && DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/probe-chipotle-decrypt.ts <0xCidRootHash> [auditorAddress]
 *
 * Uses LIT_CHIPOTLE_API_KEY + LIT_CHIPOTLE_PKP_ID + ciphertext + accessConditions.agentEns from the 0G blob.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env.local") });

const cid = (process.argv[2] ?? "").trim();
const auditor = (process.argv[3] ?? "").trim();

if (!cid.startsWith("0x")) {
  console.error(
    "Usage: DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/probe-chipotle-decrypt.ts <0xCidRootHash> [auditorAddress]",
  );
  process.exit(1);
}

async function main() {
  const storage = await import("../../0g/storage.js");
  const { chipotleDecrypt } = await import("../lit/encrypt.js");

  console.log("Downloading sealed blob from 0G…");
  const bytes = await storage.downloadBlob(cid);
  const sealed = JSON.parse(new TextDecoder().decode(bytes)) as {
    ciphertext?: string;
    fallbackKey?: string;
    accessConditions?: { agentEns?: string };
    encryptionMethod?: string;
  };

  if (sealed.fallbackKey) {
    console.error(
      "This blob uses AES fallback (fallbackKey present). Use decryptAesFallbackBlob or full audit path — not Chipotle.",
    );
    process.exit(2);
  }

  const agentEns = sealed.accessConditions?.agentEns?.trim();
  if (!sealed.ciphertext || !agentEns) {
    throw new Error("Blob missing ciphertext or accessConditions.agentEns");
  }

  const { ethers } = await import("ethers");
  const auditorAddr = auditor && ethers.isAddress(auditor) ? auditor : undefined;
  if (auditor && !auditorAddr) {
    throw new Error(`Invalid auditor address: ${auditor}`);
  }

  console.log(`agentEns: ${agentEns}`);
  console.log(`auditorAddress: ${auditorAddr ?? "(omit — Lit action may skip isAuthorized check)"}`);
  console.log("Calling chipotleDecrypt…\n");

  const plain = await chipotleDecrypt(sealed.ciphertext, agentEns, auditorAddr);
  const text = new TextDecoder().decode(plain);
  console.log("— plaintext (utf-8) —");
  console.log(text.length > 4000 ? `${text.slice(0, 4000)}…` : text);
  console.log(`\n— bytes: ${plain.length} —`);
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
