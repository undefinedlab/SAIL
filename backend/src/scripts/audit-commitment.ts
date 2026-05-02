/**
 *   cd backend && DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/audit-commitment.ts 0x...
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env.local") });

const hash = (process.argv[2] ?? "").trim();
if (!hash.startsWith("0x")) {
  console.error("Usage: npx tsx src/scripts/audit-commitment.ts 0x<commitmentHash>");
  process.exit(1);
}

async function main() {
  const { auditCommitment } = await import("../api/pipeline.js");
  const r = await auditCommitment(hash as `0x${string}`);
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
