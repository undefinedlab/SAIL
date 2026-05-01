/**
 * One-time setup: create a 0G Compute ledger and deposit funds.
 * Run this once before using sail_reason or any 0G Compute inference.
 *
 * Usage:
 *   npm run setup-compute
 */

import { ethers } from "ethers";
import { createRequire } from "node:module";
import { env } from "../config/env.js";

const require = createRequire(import.meta.url);
const sdk = require("@0gfoundation/0g-compute-ts-sdk") as {
  createZGComputeNetworkBroker: (signer: ethers.Signer) => Promise<{
    ledger: {
      addLedger: (balance: number, gasPrice?: number) => Promise<void>;
      getLedger: () => Promise<{ balance: bigint; nonce: bigint } | null>;
      depositFund: (amount: number, gasPrice?: number) => Promise<void>;
    };
    inference: {
      listService: () => Promise<Array<{ provider?: string; address?: string }>>;
    };
  }>;
};

async function main() {
  const provider = new ethers.JsonRpcProvider(env.zeroG.rpcUrl);
  const signer = new ethers.Wallet(env.zeroG.privateKey, provider);
  const address = await signer.getAddress();

  console.log(`\n=== 0G Compute Ledger Setup ===`);
  console.log(`Wallet: ${address}`);
  console.log(`RPC:    ${env.zeroG.rpcUrl}\n`);

  const broker = await sdk.createZGComputeNetworkBroker(signer);

  // 1. Check if ledger exists
  let ledger: { balance: bigint; nonce: bigint } | null = null;
  try {
    ledger = await broker.ledger.getLedger();
    console.log(`Existing ledger found — balance: ${ledger?.balance ?? "unknown"}`);
  } catch {
    ledger = null;
  }

  // 2. Create ledger if it doesn't exist (deposit 2 OG to start)
  if (!ledger) {
    console.log("Creating ledger with 2 OG initial deposit…");
    try {
      await broker.ledger.addLedger(3);
      console.log("  ✓ Ledger created with 2 OG");
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("already") || msg.includes("exists")) {
        console.log("  • Ledger already exists");
      } else {
        throw e;
      }
    }
  } else {
    // 3. Top up if balance is low
    console.log("Ledger exists — depositing 1 OG top-up…");
    try {
      await broker.ledger.depositFund(1);
      console.log("  ✓ Deposited 1 OG");
    } catch (e) {
      console.warn("  ✗ Deposit failed:", (e as Error).message);
    }
  }

  // 4. Confirm final state
  try {
    const final = await broker.ledger.getLedger();
    console.log(`\nFinal ledger balance: ${final?.balance ?? "unknown"} neuron`);
  } catch (e) {
    console.warn("Could not read final balance:", (e as Error).message);
  }

  // 5. Show available providers
  console.log("\nAvailable compute providers:");
  const services = await broker.inference.listService();
  for (const svc of services) {
    const addr = (svc as { provider?: string; address?: string }).provider
      ?? (svc as { address?: string }).address ?? "unknown";
    console.log(`  • ${addr}`);
  }

  console.log("\n=== Done — run: npm run smoke -- compute ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
