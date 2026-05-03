/**
 *   cd backend && DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/audit-commitment.ts 0x...
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env.local") });

const hash = (process.argv[2] ?? "").trim();
const auditorArg = (process.argv[3] ?? "").trim();
if (!hash.startsWith("0x")) {
  console.error(
    "Usage: npx tsx src/scripts/audit-commitment.ts 0x<commitmentHash> [auditorAddress]",
  );
  process.exit(1);
}

async function main() {
  const { ethers } = await import("ethers");
  const { auditCommitment } = await import("../api/pipeline.js");
  const auditorAddress =
    auditorArg && ethers.isAddress(auditorArg) ? (auditorArg as `0x${string}`) : undefined;
  const r = await auditCommitment(hash as `0x${string}`, { auditorAddress });
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
