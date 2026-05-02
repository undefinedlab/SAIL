/**
 * One-off / CLI: create *.sail.eth subname (if parent is configured) + SAIL register.
 *
 * Usage (from repo root or backend):
 *   cd backend && DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/register-ens-agent.ts zen.sail.eth
 *   cd backend && DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/register-ens-agent.ts zen.sail.eth --sail-only
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { ethers } from "ethers";
import { zeroAddress } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env.local") });

const args = process.argv.slice(2).filter((a) => a !== "--sail-only");
const sailOnly = process.argv.includes("--sail-only");
const fullEns = (args[0] ?? "").trim().toLowerCase();
if (!fullEns || !fullEns.includes(".")) {
  console.error(
    "Usage: npx tsx src/scripts/register-ens-agent.ts <full-ens> [--sail-only]   e.g. zen.sail.eth",
  );
  process.exit(1);
}

const parts = fullEns.split(".");
if (parts.length < 2) {
  console.error("Expected at least label.parent.tld");
  process.exit(1);
}
const subLabel = parts[0];
const parentName = parts.slice(1).join(".");

async function main() {
  const { SAIL_ADDRESS, operatorAddress, getAgent, register, waitForReceipt } = await import(
    "../contract/sail.js"
  );
  const ens = await import("../../ens/registry.js");

  const existing = await getAgent(fullEns);
  if (existing.wallet.toLowerCase() !== zeroAddress.toLowerCase()) {
    console.log("Already registered on SAIL:", fullEns);
    console.log({
      wallet: existing.wallet,
      stake: existing.stake.toString(),
      active: existing.active,
      tier: existing.tier,
    });
    return;
  }

  if (!sailOnly) {
    console.log("ENS: creating subname", `${subLabel}.${parentName}`, "…");
    const ensResult = await ens.registerAgentSubname(parentName, subLabel, {
      sail_tier: "optimistic",
      sail_contract: SAIL_ADDRESS,
      capabilities: "commit,execute,audit",
      auditors: operatorAddress,
      axl_peer_id: "",
    });
    console.log("ENS txs:", ensResult.txHashes);
  } else {
    console.log("ENS: skipped (--sail-only)");
  }

  console.log("SAIL: register (0.01 ETH stake, operator as auditor) …");
  const stakeWei = ethers.parseEther("0.01");
  const txHash = await register(fullEns, 0, [operatorAddress], stakeWei);
  await waitForReceipt(txHash);
  const agent = await getAgent(fullEns);
  console.log("Done.");
  console.log({
    ens: fullEns,
    registerTx: txHash,
    wallet: agent.wallet,
    stake: agent.stake.toString(),
    active: agent.active,
  });
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
