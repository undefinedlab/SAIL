/**
 * SAIL MCP Server.
 *
 * Exposes the SAIL pipeline + registration tools to any MCP-compatible agent framework:
 *   CrewAI · LangChain · ElizaOS · OpenClaw · Claude · custom
 *
 * The LLM calls these tools exactly like any other tool during its reasoning
 * turn. No wrappers, no interception, no changes to agent business logic.
 * One MCP server — every compatible framework, zero per-framework integration.
 *
 * Run:
 *   npm run mcp                        → stdio (Claude Desktop, local Cursor command)
 *   npm run mcp:http                   → Streamable HTTP (remote Cursor url: http://host:port/mcp)
 *   MCP_TRANSPORT=http npm run mcp     → same as mcp:http
 *
 * Tools:
 *   sail_register        On-chain agent registration (operator-signed; same as POST /api/register)
 *   sail_attest_inputs   Stage 01 — hash inputs before reasoning
 *   sail_commit          Stage 03 — Lit encrypt → 0G upload → SAIL anchor
 *   sail_execute         Stage 04 — contract-gated execution
 *   sail_deliver         Stage 05 — send tx via AXL encrypted mesh
 *   sail_discover        Discovery — find agents by capability via ENS
 *   sail_delegate        Delegation — open AXL channel, send task to worker
 *   sail_receive_messages Poll AXL inbox
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import type { Address } from "viem";
import * as pipeline from "../api/pipeline.js";
import * as axl from "../../gensyn/client.js";
import * as ens from "../../ens/registry.js";
import * as sailContract from "../contract/sail.js";
import { SAIL_ADDRESS } from "../contract/sail.js";

export function createSailMcpServer(): McpServer {
  const mcp = new McpServer({
    name: "sail",
    version: "1.0.0",
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Registration — sail_register (operator wallet; agents[ens].wallet = operator)
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_register",
    "Register a new agent on the SAIL contract. Signs with the server operator key — on-chain agent.wallet becomes the operator address (same as POST /api/register). Requires a unique ENS string (e.g. myagent.sail.eth). Mint ENS subname separately via dashboard or POST /api/ens/register if you use *.sail.eth.",
    {
      ens: z
        .string()
        .describe("Full ENS name for this agent (must not already be registered)"),
      tier: z
        .number()
        .int()
        .min(0)
        .max(2)
        .optional()
        .describe("0 = optimistic, 1 = ZK, 2 = TEE (default 0)"),
      auditors: z
        .array(z.string())
        .min(1)
        .describe("Ethereum addresses authorized to audit/slash (0x-prefixed hex)"),
      stakeEth: z
        .string()
        .optional()
        .describe('Stake in ETH as a decimal string (default "0.01"; must meet contract minimum)'),
    },
    async ({ ens, tier = 0, auditors, stakeEth = "0.01" }) => {
      const stakeWei = ethers.parseEther(String(stakeEth));
      const addrs = auditors.map((a) => {
        if (!ethers.isAddress(a)) {
          throw new Error(`Invalid auditor address: ${a}`);
        }
        return a as Address;
      });
      const txHash = await sailContract.register(ens, tier as 0 | 1 | 2, addrs, stakeWei);
      await sailContract.waitForReceipt(txHash);
      const agent = await sailContract.getAgent(ens);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              txHash,
              etherscan: `https://sepolia.etherscan.io/tx/${txHash}`,
              ens,
              agent: {
                wallet: agent.wallet,
                stake: agent.stake.toString(),
                tier: agent.tier,
                active: agent.active,
                auditors: agent.auditors,
                commitmentCount: agent.commitmentCount.toString(),
                slashCount: agent.slashCount.toString(),
              },
              note: "Agent registered. You can call sail_attest_inputs → sail_commit → sail_execute for this ens.",
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Stage 01 — sail_attest_inputs
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_attest_inputs",
    "Hash all inputs before reasoning begins. Call this first, before any LLM reasoning. Returns an inputHash that must be included in the subsequent sail_commit call.",
    {
      inputs: z
        .unknown()
        .describe(
          "All data the agent has received — task description, context, market data, etc. Can be any JSON-serialisable value.",
        ),
    },
    async ({ inputs }) => {
      const result = pipeline.attestInputs(inputs);
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
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Stage 03 — sail_commit
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_commit",
    "Lock your decision on-chain before executing. Encrypts the commitment blob via Lit Protocol, uploads it to 0G Storage, and anchors the hash on the SAIL contract. You cannot call sail_execute until this succeeds. Returns commitmentHash and cid.",
    {
      agentEns: z
        .string()
        .describe("Your ENS name (e.g. treasury-agent.sail.eth)"),
      inputHash: z
        .string()
        .describe("The inputHash returned by sail_attest_inputs"),
      decision: z
        .string()
        .describe("Your reasoning output — what you decided to do and why"),
      proposedAction: z
        .string()
        .describe(
          "The exact action you will take (calldata, tx description, etc.)",
        ),
      attestation: z
        .string()
        .optional()
        .describe("0G Compute sealed inference attestation (ZK tier only)"),
    },
    async ({ agentEns, inputHash, decision, proposedAction, attestation }) => {
      const result = await pipeline.commit({
        agentEns,
        inputHash: inputHash as `0x${string}`,
        decision,
        proposedAction,
        attestation,
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
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Stage 04 — sail_execute
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_execute",
    "Clear the SAIL execution gate. The contract verifies a valid prior commitment exists for this agent — if not, execution reverts. Only call this after sail_commit succeeds.",
    {
      agentEns: z.string().describe("Your ENS name"),
      commitmentHash: z
        .string()
        .describe("The commitmentHash returned by sail_commit"),
    },
    async ({ agentEns, commitmentHash }) => {
      const result = await pipeline.execute(
        agentEns,
        commitmentHash as `0x${string}`,
      );
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
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Stage 05 — sail_deliver
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_deliver",
    "Submit a transaction via the AXL encrypted P2P mesh. The transaction bytes are pre-committed on-chain before submission so any in-transit modification is detectable.",
    {
      txBytes: z.string().describe("Hex-encoded transaction bytes to deliver"),
      recipientPeerId: z
        .string()
        .optional()
        .describe("AXL peer ID of the target node (omit to broadcast)"),
    },
    async ({ txBytes, recipientPeerId }) => {
      const alive = await axl.isAlive();
      if (!alive) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error:
                  "AXL node not reachable. Ensure the AXL binary is running.",
                axlBridgeUrl:
                  process.env["AXL_BRIDGE_URL"] ?? "http://localhost:9002",
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
        // Broadcast via AXL topology peers
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
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Discovery — sail_discover
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_discover",
    "Find SAIL agents by ENS name and read their capability records. Returns the agent's AXL peer ID, tier, capabilities, and stake status so you can decide whether to delegate to them.",
    {
      ensName: z
        .string()
        .describe("Full ENS name to look up (e.g. worker.sail.eth)"),
    },
    async ({ ensName }) => {
      const records = await ens.resolveAgentRecords(ensName);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ensName,
              records,
              note: "Use axl_peer_id with sail_delegate to open a task channel.",
            }),
          },
        ],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Delegation — sail_delegate
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_delegate",
    "Delegate a task to a worker agent via AXL encrypted P2P channel. Resolves the worker's ENS name to get its AXL peer ID, then sends the task payload. The worker runs the full SAIL pipeline and returns a commitmentHash proving it acted correctly.",
    {
      workerEns: z
        .string()
        .describe("Worker agent ENS name (e.g. worker.sail.eth)"),
      task: z.string().describe("Task description / payload for the worker"),
      context: z
        .unknown()
        .optional()
        .describe("Additional structured context to pass alongside the task"),
    },
    async ({ workerEns, task, context }) => {
      // Resolve worker's AXL peer ID from ENS
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
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Bonus — sail_receive_messages (poll AXL inbox)
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_receive_messages",
    "Poll the AXL inbox for messages from other agents. Returns task results, commitment hashes, and any other messages addressed to this node.",
    {
      since: z
        .number()
        .optional()
        .describe("Unix timestamp ms — only return messages after this time"),
    },
    async ({ since }) => {
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
    },
  );

  return mcp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
  const mcp = createSailMcpServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error("[MCP] SAIL server running on stdio");
}
