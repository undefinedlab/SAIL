/**
 * Run attest → commit → execute for one agent (same logic as SAIL MCP tools).
 *
 *   cd backend && DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/test-pipeline-agent.ts zen.sail.eth
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env.local") });

const agentEns = (process.argv[2] ?? "").trim() || "zen.sail.eth";

async function main() {
  const pipeline = await import("../api/pipeline.js");
  const { getAgent } = await import("../contract/sail.js");
  const { zeroAddress } = await import("viem");

  const agent = await getAgent(agentEns);
  if (agent.wallet.toLowerCase() === zeroAddress.toLowerCase()) {
    console.error(`Not registered on SAIL: ${agentEns}`);
    process.exit(1);
  }
  if (!agent.active) {
    console.error(`Agent inactive: ${agentEns}`);
    process.exit(1);
  }

  console.log(`\n[sail] agent ${agentEns} active, nonce pipeline starting…\n`);

  const attest = pipeline.attestInputs({
    task: "Automated test: SAIL commit-before-execute chain",
    context: { script: "test-pipeline-agent.ts", at: new Date().toISOString() },
  });
  console.log("1) sail_attest_inputs → inputHash:", attest.inputHash);

  const commit = await pipeline.commit({
    agentEns,
    inputHash: attest.inputHash,
    decision:
      "Test run only: confirm pipeline works; no real-world action authorized.",
    proposedAction: "none — smoke test",
  });
  console.log("2) sail_commit → commitmentHash:", commit.commitmentHash);
  console.log("   cid:", commit.cid);
  console.log("   tx:", commit.txHash);

  const exec = await pipeline.execute(agentEns, commit.commitmentHash);
  console.log("3) sail_execute → tx:", exec.txHash);
  console.log("\n✓ Full chain OK for", agentEns);
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
