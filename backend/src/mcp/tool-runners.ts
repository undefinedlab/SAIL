/**
 * Shared implementations for SAIL MCP tools — used by stdio/Streamable MCP and POST /api/mcp/invoke.
 */

import { ethers } from "ethers";
import { isAddress, parseEther, type Address, type Hex } from "viem";
import * as pipeline from "../api/pipeline.js";
import * as axl from "../../gensyn/client.js";
import * as ens from "../../ens/registry.js";
import * as sailContract from "../contract/sail.js";
import { SAIL_ADDRESS, operatorClient, publicClient } from "../contract/sail.js";
import { registerEnsSubnameForAgentIfApplicable } from "../api/register-agent-shared.js";
import { env } from "../config/env.js";

export type ToolTextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export async function runSailRegister(args: {
  ens: string;
  tier?: number;
  auditors: string[];
  stakeEth?: string;
  skipEns?: boolean;
  ensExtraRecords?: Record<string, string>;
}): Promise<ToolTextResult> {
  const { ens, tier = 0, auditors, stakeEth = "0.01", skipEns = false, ensExtraRecords } = args;
  const stakeWei = ethers.parseEther(String(stakeEth));
  const addrs = auditors.map((a) => {
    if (!ethers.isAddress(a)) {
      throw new Error(`Invalid auditor address: ${a}`);
    }
    return a as Address;
  });
  const auditorStrs = auditors.map((a) => String(a).trim());
  const txHash = await sailContract.register(ens, tier as 0 | 1 | 2, addrs, stakeWei);
  await sailContract.waitForReceipt(txHash);
  const agent = await sailContract.getAgent(ens);

  const ensSubname = await registerEnsSubnameForAgentIfApplicable({
    ens,
    tier: tier as 0 | 1 | 2,
    auditors: auditorStrs,
    skipEns,
    ensExtraRecords: ensExtraRecords ?? undefined,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          txHash,
          etherscan: `https://sepolia.etherscan.io/tx/${txHash}`,
          ens,
          tier,
          stakeEth: String(stakeEth),
          agent: {
            wallet: agent.wallet,
            stake: agent.stake.toString(),
            tier: agent.tier,
            active: agent.active,
            auditors: agent.auditors,
            commitmentCount: agent.commitmentCount.toString(),
            slashCount: agent.slashCount.toString(),
          },
          ensSubname,
          note: ensSubname
            ? "SAIL registered; ENS subname tx(s) emitted — text records may finalize in the background (pendingRecords)."
            : skipEns
              ? "SAIL registered (ENS skipped). Call sail_attest_inputs → sail_commit → sail_execute when ready."
              : "SAIL registered. No ENS subname step (name not under configured parent, or ENS failed — see server logs). Pipeline: sail_attest_inputs → sail_commit → sail_execute.",
        }),
      },
    ],
  };
}

export async function runSailAttestInputs(args: { inputs: unknown }): Promise<ToolTextResult> {
  const result = pipeline.attestInputs(args.inputs);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          inputHash: result.inputHash,
          timestamp: result.timestamp,
          note: "Preserve this inputHash. Pass it to sail_commit along with your decision.",
        }),
      },
    ],
  };
}

export async function runSailCommit(args: {
  agentEns: string;
  inputHash: string;
  decision: string;
  proposedAction: string;
  attestation?: string;
  auditContext?: unknown;
}): Promise<ToolTextResult> {
  const result = await pipeline.commit({
    agentEns: args.agentEns,
    inputHash: args.inputHash as `0x${string}`,
    decision: args.decision,
    proposedAction: args.proposedAction,
    attestation: args.attestation,
    auditContext: args.auditContext,
  });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          commitmentHash: result.commitmentHash,
          cid: result.cid,
          nonce: result.nonce.toString(),
          txHash: result.txHash,
          etherscan: `https://sepolia.etherscan.io/tx/${result.txHash}`,
          note: "Commitment anchored on-chain. Call sail_execute with this commitmentHash to proceed.",
        }),
      },
    ],
  };
}

export async function runSailThinkWithSail(args: {
  agentEns: string;
  inputs: unknown;
  decision: string;
  proposedAction: string;
  attestation?: string;
  runExecute?: boolean;
  /**
   * When set with runExecute, sends native Sepolia ETH from OPERATOR_PRIVATE_KEY only after
   * on-chain `execute` succeeds — order: attest → commit → execute → transfer (fulfillment).
   */
  nativeTransfer?: { to: string; amountEth: string };
}): Promise<ToolTextResult> {
  const {
    agentEns,
    inputs,
    decision,
    proposedAction,
    attestation,
    runExecute = false,
    nativeTransfer,
  } = args;

  if (nativeTransfer && !runExecute) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "nativeTransfer requires runExecute: true. Flow is attest → commit → SAIL execute (gate) → then native transfer.",
          }),
        },
      ],
      isError: true,
    };
  }

  if (nativeTransfer) {
    const addr = nativeTransfer.to.trim();
    if (!isAddress(addr)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `nativeTransfer.to is not a valid address: ${nativeTransfer.to}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  const attest = pipeline.attestInputs(inputs);
  const commitResult = await pipeline.commit({
    agentEns,
    inputHash: attest.inputHash,
    decision,
    proposedAction,
    attestation,
    auditContext: inputs,
  });
  const out: Record<string, unknown> = {
    inputHash: attest.inputHash,
    attestedAt: attest.timestamp,
    commitmentHash: commitResult.commitmentHash,
    cid: commitResult.cid,
    nonce: commitResult.nonce.toString(),
    commitTxHash: commitResult.txHash,
    commitEtherscan: `https://sepolia.etherscan.io/tx/${commitResult.txHash}`,
    note: runExecute
      ? "Committed; clearing execute gate…"
      : "Committed with auditContext=input snapshot. Call sail_execute when ready, or use sail_audit_commitment to verify the blob.",
  };
  if (runExecute) {
    const execResult = await pipeline.execute(agentEns, commitResult.commitmentHash);
    out["executeTxHash"] = execResult.txHash;
    out["executeEtherscan"] = `https://sepolia.etherscan.io/tx/${execResult.txHash}`;
    out["note"] = nativeTransfer
      ? "SAIL execute cleared; broadcasting native transfer as fulfillment…"
      : "Attest + commit + execute complete for this episode.";

    if (nativeTransfer) {
      const to = nativeTransfer.to.trim() as Address;
      const transferHash: Hex = await operatorClient.sendTransaction({
        to,
        value: parseEther(String(nativeTransfer.amountEth)),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
      if (receipt.status !== "success") {
        throw new Error(`Native transfer reverted after SAIL execute: ${transferHash}`);
      }
      out["nativeTransferTxHash"] = transferHash;
      out["nativeTransferEtherscan"] = `https://sepolia.etherscan.io/tx/${transferHash}`;
      out["note"] =
        "Attest + commit + SAIL execute, then native Sepolia transfer (commitment bound intent before funds moved).";
    }
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(out, null, 2),
      },
    ],
  };
}

function mergeReasonAuditContext(
  inputs: unknown,
  prompt: string,
  reason: pipeline.ReasonResult,
): Record<string, unknown> {
  const base =
    inputs !== undefined && inputs !== null && typeof inputs === "object" && !Array.isArray(inputs)
      ? { ...(inputs as Record<string, unknown>) }
      : inputs === undefined || inputs === null
        ? {}
        : { context: inputs };
  return {
    ...base,
    reasonPrompt: prompt,
    sealedInference: {
      output: reason.output,
      model: reason.model,
      providerAddress: reason.providerAddress,
      verified: reason.verified,
    },
  };
}

/**
 * 0G Compute sealed inference → attestation embedded in commit blob, then same path as sail_think_with_sail.
 * Use for ZK-tier-style auditability (attestation in ciphertext) vs optimistic-only sail_think_with_sail.
 */
export async function runSailReasonWithSailPlus(args: {
  agentEns: string;
  prompt: string;
  systemPrompt?: string;
  inputs?: unknown;
  /** Defaults to sealed-inference output when omitted. */
  decision?: string;
  proposedAction: string;
  runExecute?: boolean;
  nativeTransfer?: { to: string; amountEth: string };
}): Promise<ToolTextResult> {
  let reasonResult: pipeline.ReasonResult;
  try {
    reasonResult = await pipeline.reason(args.prompt, args.systemPrompt);
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `0G Compute sealed inference failed: ${(e as Error).message ?? String(e)}`,
            hint: "Fund ledger and pick a provider: npm run setup-compute, ZERO_G_PRIVATE_KEY, optional ZERO_G_COMPUTE_PROVIDER. Verify: npm run smoke -- compute",
          }),
        },
      ],
      isError: true,
    };
  }

  const mergedInputs = mergeReasonAuditContext(args.inputs, args.prompt, reasonResult);
  const decision =
    args.decision !== undefined && String(args.decision).trim() !== ""
      ? String(args.decision)
      : reasonResult.output;

  const inner = await runSailThinkWithSail({
    agentEns: args.agentEns,
    inputs: mergedInputs,
    decision,
    proposedAction: args.proposedAction,
    attestation: reasonResult.attestation,
    runExecute: args.runExecute,
    nativeTransfer: args.nativeTransfer,
  });

  if (inner.isError) {
    return inner;
  }

  try {
    const body = JSON.parse(inner.content[0]!.text as string) as Record<string, unknown>;
    const enriched = {
      pipeline: "sail_reason_with_sailplus",
      sealedInference: {
        model: reasonResult.model,
        providerAddress: reasonResult.providerAddress,
        verified: reasonResult.verified,
        outputPreview:
          reasonResult.output.length > 2000
            ? `${reasonResult.output.slice(0, 2000)}…`
            : reasonResult.output,
        attestationPresent: Boolean(reasonResult.attestation),
      },
      ...body,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
    };
  } catch {
    return inner;
  }
}

export async function runSailExecute(args: {
  agentEns: string;
  commitmentHash: string;
}): Promise<ToolTextResult> {
  const result = await pipeline.execute(args.agentEns, args.commitmentHash as `0x${string}`);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          txHash: result.txHash,
          commitmentHash: result.commitmentHash,
          etherscan: `https://sepolia.etherscan.io/tx/${result.txHash}`,
          note: "Execution cleared. You may now perform the committed action.",
        }),
      },
    ],
  };
}

export async function runSailAuditCommitment(args: { commitmentHash: string }): Promise<ToolTextResult> {
  const result = await pipeline.auditCommitment(args.commitmentHash as `0x${string}`);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export async function runSailDeliver(args: {
  txBytes: string;
  recipientPeerId?: string;
}): Promise<ToolTextResult> {
  const { txBytes, recipientPeerId } = args;
  const alive = await axl.isAlive();
  if (!alive) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "AXL node not reachable. Ensure the AXL binary is running.",
            axlBridgeUrl: env.axl.bridgeUrl,
          }),
        },
      ],
      isError: true,
    };
  }

  if (recipientPeerId) {
    await axl.sendMessage({
      to: recipientPeerId,
      message: JSON.stringify({ type: "sail.tx", txBytes }),
      topic: "sail.tx",
    });
  } else {
    const topology = await axl.getTopology();
    await Promise.all(
      topology.peers.map((p) =>
        axl.sendMessage({
          to: p.peerId,
          message: JSON.stringify({ type: "sail.tx", txBytes }),
          topic: "sail.tx",
        }),
      ),
    );
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          delivered: true,
          via: "axl",
          recipient: recipientPeerId ?? "broadcast",
        }),
      },
    ],
  };
}

export async function runSailDiscover(args: { ensName: string }): Promise<ToolTextResult> {
  const records = await ens.resolveAgentRecords(args.ensName);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ensName: args.ensName,
          records,
          note: "Use axl_peer_id with sail_delegate to open a task channel.",
        }),
      },
    ],
  };
}

export async function runSailDelegate(args: {
  workerEns: string;
  task: string;
  context?: unknown;
}): Promise<ToolTextResult> {
  const { workerEns, task, context } = args;
  const records = await ens.resolveAgentRecords(workerEns);
  const peerId = records.axl_peer_id;

  if (!peerId) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `No axl_peer_id found for ${workerEns}. The worker must be registered with SAIL.`,
            records,
          }),
        },
      ],
      isError: true,
    };
  }

  const alive = await axl.isAlive();
  if (!alive) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "AXL node not reachable" }),
        },
      ],
      isError: true,
    };
  }

  const payload = {
    type: "sail.task",
    from: "hiring-agent",
    task,
    context,
    sailContract: SAIL_ADDRESS,
    timestamp: Date.now(),
  };

  await axl.sendMessage({
    to: peerId,
    message: JSON.stringify(payload),
    topic: "sail.task",
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sent: true,
          to: workerEns,
          peerId,
          note: "Task sent via AXL. Poll sail_receive_messages to get the worker's result + commitmentHash.",
        }),
      },
    ],
  };
}

export async function runSailReceiveMessages(args: { since?: number }): Promise<ToolTextResult> {
  const { since } = args;
  const alive = await axl.isAlive();
  if (!alive) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ messages: [], axlOnline: false }),
        },
      ],
    };
  }
  const messages = await axl.receiveMessages(since);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ messages, count: messages.length }),
      },
    ],
  };
}

const registry: Record<string, (args: Record<string, unknown>) => Promise<ToolTextResult>> = {
  sail_register: (a) => runSailRegister(a as Parameters<typeof runSailRegister>[0]),
  sail_attest_inputs: (a) => runSailAttestInputs(a as Parameters<typeof runSailAttestInputs>[0]),
  sail_commit: (a) => runSailCommit(a as Parameters<typeof runSailCommit>[0]),
  sail_think_with_sail: (a) => runSailThinkWithSail(a as Parameters<typeof runSailThinkWithSail>[0]),
  sail_reason_with_sailplus: (a) =>
    runSailReasonWithSailPlus(a as Parameters<typeof runSailReasonWithSailPlus>[0]),
  sail_execute: (a) => runSailExecute(a as Parameters<typeof runSailExecute>[0]),
  sail_audit_commitment: (a) => runSailAuditCommitment(a as Parameters<typeof runSailAuditCommitment>[0]),
  sail_deliver: (a) => runSailDeliver(a as Parameters<typeof runSailDeliver>[0]),
  sail_discover: (a) => runSailDiscover(a as Parameters<typeof runSailDiscover>[0]),
  sail_delegate: (a) => runSailDelegate(a as Parameters<typeof runSailDelegate>[0]),
  sail_receive_messages: (a) => runSailReceiveMessages(a as Parameters<typeof runSailReceiveMessages>[0]),
};

export function listSailMcpToolNames(): string[] {
  return Object.keys(registry);
}

export async function invokeSailMcpTool(
  tool: string,
  arguments_: Record<string, unknown>,
): Promise<ToolTextResult> {
  const fn = registry[tool];
  if (!fn) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Unknown tool: ${tool}`,
            knownTools: listSailMcpToolNames(),
          }),
        },
      ],
      isError: true,
    };
  }
  try {
    return await fn(arguments_ ?? {});
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: (err as Error).message ?? String(err),
          }),
        },
      ],
      isError: true,
    };
  }
}
