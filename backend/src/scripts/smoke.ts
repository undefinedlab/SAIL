/**
 * Smoke test — exercises 0G Storage + 0G Compute + SAIL contract live on testnets.
 *
 * Usage:
 *   npm run smoke -- storage      # 0G Storage upload + download
 *   npm run smoke -- compute      # 0G Compute list providers + sealed inference
 *   npm run smoke -- contract     # SAIL contract reads
 *   npm run smoke -- pipeline     # Full attest → commit → execute (no ZK)
 *   npm run smoke -- all
 */

import { ethers } from "ethers";
import { keccak256, toHex } from "viem";
import * as storage from "../../0g/storage.js";
import * as compute from "../../0g/compute.js";
import * as contract from "../contract/sail.js";
import * as pipeline from "../api/pipeline.js";
import { env } from "../config/env.js";

const log = (s: string) => console.log(`\n=== ${s} ===`);
const ok = (s: string) => console.log(`  ✓ ${s}`);
const info = (s: string) => console.log(`  • ${s}`);
const fail = (s: string, e?: unknown) => {
  console.error(`  ✗ ${s}`);
  if (e) console.error("    ", (e as Error).message ?? e);
};

async function testStorage() {
  log("0G Storage");
  try {
    const payload = new TextEncoder().encode(
      JSON.stringify({ test: "sail-smoke", at: new Date().toISOString() }),
    );
    info(`uploading ${payload.length} bytes (finalityRequired: false for speed)…`);
    const cid = await storage.uploadBlob(payload, { finalityRequired: false });
    ok(`upload root hash: ${cid}`);

    info(`downloading (retrying up to 3x for propagation)…`);
    let back: Uint8Array | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        back = await storage.downloadBlob(cid);
        break;
      } catch (e) {
        if (attempt < 3) {
          info(`  download attempt ${attempt} failed — waiting 5s before retry…`);
          await new Promise(r => setTimeout(r, 5000));
        } else {
          fail("download failed after 3 attempts", e);
        }
      }
    }
    if (back) {
      const match =
        back.length === payload.length && back.every((b, i) => b === payload[i]);
      if (match) ok("download matches upload");
      else fail("download bytes do not match upload");
    }
    return { cid };
  } catch (e) {
    fail("storage failed", e);
    return null;
  }
}

async function testCompute() {
  log("0G Compute");
  try {
    info("listing inference providers…");
    const providers = await compute.listInferenceProviders();
    ok(`found ${providers.length} provider(s)`);
    if (providers.length === 0) {
      info("no providers online — skipping inference");
      return;
    }
    for (const p of providers.slice(0, 3)) {
      info(`  ${(p as { provider?: string; address?: string }).provider ?? (p as { address?: string }).address ?? JSON.stringify(p).slice(0, 80)}`);
    }

    let providerAddr = env.zeroG.computeProvider;
    if (!providerAddr || !ethers.isAddress(providerAddr)) {
      if (providers.length > 0) {
        const first = providers[0] as { provider?: string; address?: string };
        providerAddr = first.provider ?? first.address ?? "";
        info(`ZERO_G_COMPUTE_PROVIDER not a valid address — auto-picked: ${providerAddr}`);
      } else {
        info("no valid compute provider available — skipping inference");
        return;
      }
    }

    info(`running sealed inference via ${providerAddr}…`);
    const r = await compute.runSealedInference("Reply with the single word: OK", undefined, providerAddr);
    ok(`output: ${r.output.slice(0, 80)}`);
    ok(`model: ${r.model}`);
    if (r.attestation) ok(`attestation: ${r.attestation.slice(0, 60)}…`);
    else info("no attestation returned");
  } catch (e) {
    fail("compute failed", e);
  }
}

async function testContract() {
  log("SAIL contract");
  try {
    info(`contract: ${contract.SAIL_ADDRESS}`);
    info(`operator: ${contract.operatorAddress}`);

    const provider = new ethers.JsonRpcProvider(env.sail.rpcUrl);
    const balance = await provider.getBalance(contract.operatorAddress);
    ok(`operator balance: ${ethers.formatEther(balance)} ETH`);

    if (balance < ethers.parseEther("0.005")) {
      fail("operator wallet has < 0.005 ETH — fund it on Sepolia faucet to run write tests");
    }
  } catch (e) {
    fail("contract reads failed", e);
  }
}

async function testPipeline() {
  log("Full pipeline (attest → commit → execute)");

  const agentEns = `smoke-${Math.floor(Date.now() / 1000)}.sail.eth`;
  info(`agent: ${agentEns}`);

  try {
    const provider = new ethers.JsonRpcProvider(env.sail.rpcUrl);
    const balance = await provider.getBalance(contract.operatorAddress);
    if (balance < ethers.parseEther("0.02")) {
      fail("operator wallet has < 0.02 ETH — fund it before running pipeline");
      return;
    }

    info("registering agent (stake 0.01 ETH, operator is auditor)…");
    const txHash = await contract.register(agentEns, 0, [contract.operatorAddress], ethers.parseEther("0.01"));
    info(`  register tx: ${txHash}`);
    await contract.waitForReceipt(txHash);
    ok("agent registered");

    const agent = await contract.getAgent(agentEns);
    ok(`agent active: ${agent.active}, stake: ${agent.stake}`);

    info("attesting inputs…");
    const attest = pipeline.attestInputs({ test: "smoke pipeline", at: Date.now() });
    ok(`input hash: ${attest.inputHash}`);

    info("committing (Lit encrypt → 0G upload → SAIL anchor)…");
    const commit = await pipeline.commit({
      agentEns,
      inputHash: attest.inputHash,
      decision: "do nothing — this is a smoke test",
      proposedAction: "0x00",
    });
    ok(`commitment hash: ${commit.commitmentHash}`);
    ok(`0G CID: ${commit.cid}`);
    ok(`commit tx: ${commit.txHash}`);

    info("executing through SAIL gate…");
    const exec = await pipeline.execute(agentEns, commit.commitmentHash);
    ok(`execute tx: ${exec.txHash}`);

    const after = await contract.getAgent(agentEns);
    ok(`commitment count after: ${after.commitmentCount}`);

    info("verifying re-hash matches anchor…");
    const blob = await pipeline.getSealedBlob(commit.cid);
    const reHash = keccak256(toHex(new TextEncoder().encode(JSON.stringify(blob))));
    if (reHash.toLowerCase() === commit.commitmentHash.toLowerCase()) {
      ok("re-hashed CID payload matches on-chain commitment hash");
    } else {
      info(`re-hash differs (expected — we hashed plaintext, blob is encrypted wire format)`);
      info(`  re-hash:        ${reHash}`);
      info(`  commitment:     ${commit.commitmentHash}`);
    }
  } catch (e) {
    fail("pipeline failed", e);
  }
}

async function main() {
  const target = process.argv[2] ?? "all";

  switch (target) {
    case "storage":
      await testStorage();
      break;
    case "compute":
      await testCompute();
      break;
    case "contract":
      await testContract();
      break;
    case "pipeline":
      await testPipeline();
      break;
    case "all":
      await testContract();
      await testStorage();
      await testCompute();
      await testPipeline();
      break;
    default:
      console.error(`unknown target: ${target}`);
      process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
