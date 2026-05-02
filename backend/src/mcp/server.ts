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
 *   sail_register        SAIL contract register + optional ENS subname/records (same as POST /api/register)
 *   sail_attest_inputs   Stage 01 — hash inputs before reasoning
 *   sail_think_with_sail      One-shot attest → commit (+ optional execute); optimistic reasoning
 *   sail_reason_with_sailplus Same flow after 0G sealed inference; attestation in blob (ZK-style evidence)
 *   sail_commit          Stage 03 — Lit encrypt → 0G upload → SAIL anchor
 *   sail_execute         Stage 04 — contract-gated execution
 *   sail_audit_commitment Fetch 0G blob + decrypt (AES fallback) or describe Lit blob
 *   sail_deliver         Stage 05 — send tx via AXL encrypted mesh
 *   sail_discover        Discovery — find agents by capability via ENS
 *   sail_delegate        Delegation — open AXL channel, send task to worker
 *   sail_receive_messages Poll AXL inbox
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  runSailRegister,
  runSailAttestInputs,
  runSailCommit,
  runSailThinkWithSail,
  runSailReasonWithSailPlus,
  runSailExecute,
  runSailAuditCommitment,
  runSailDeliver,
  runSailDiscover,
  runSailDelegate,
  runSailReceiveMessages,
} from "./tool-runners.js";

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
    "Register on the SAIL contract (tier 0=optimistic, 1=ZK, 2=TEE; stakeEth; full ens name). All txs are signed with the server OPERATOR_PRIVATE_KEY — configure that key for local runs. If ens is a subdomain of the configured parent (e.g. myagent.sail.eth), also creates the ENS subname and writes sail_tier, sail_contract, auditors, plus optional ensExtraRecords (capabilities, axl_peer_id, …). Same behavior as POST /api/register. Use skipEns true for on-chain-only.",
    {
      ens: z
        .string()
        .describe("Full ENS name (e.g. myagent.sail.eth); must not already be registered on SAIL"),
      tier: z
        .number()
        .int()
        .min(0)
        .max(2)
        .optional()
        .describe("Trust tier: 0 = optimistic, 1 = ZK, 2 = TEE (default 0). Written on-chain and in ENS sail_tier text record."),
      auditors: z
        .array(z.string())
        .min(1)
        .describe("Auditor addresses (0x…) authorized to audit/slash; also stored in ENS auditors text record (comma-separated)."),
      stakeEth: z
        .string()
        .optional()
        .describe('ETH stake as decimal string (default "0.01"; must meet contract minimum).'),
      skipEns: z
        .boolean()
        .optional()
        .describe("If true, only SAIL contract register — no ENS subname (default false)."),
      ensExtraRecords: z
        .record(z.string())
        .optional()
        .describe(
          "Optional ENS text keys merged after defaults, e.g. capabilities: \"commit,execute\", axl_peer_id: \"…\"",
        ),
    },
    async (args) =>
      runSailRegister({
        ens: args.ens,
        tier: args.tier,
        auditors: args.auditors,
        stakeEth: args.stakeEth,
        skipEns: args.skipEns,
        ensExtraRecords: args.ensExtraRecords,
      }),
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
    async ({ inputs }) => runSailAttestInputs({ inputs }),
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
      auditContext: z
        .unknown()
        .optional()
        .describe(
          "Optional JSON stored in the encrypted commitment blob for audit (user prompt, tool traces).",
        ),
    },
    async (a) =>
      runSailCommit({
        agentEns: a.agentEns,
        inputHash: a.inputHash,
        decision: a.decision,
        proposedAction: a.proposedAction,
        attestation: a.attestation,
        auditContext: a.auditContext,
      }),
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // One-shot — sail_think_with_sail (attest + commit + optional execute)
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_think_with_sail",
    "Verifiable episode in order: (1) attest inputs → hash, (2) on-chain commit (sealed blob + auditContext), (3) optional sail_execute to clear the gate, (4) optional nativeTransfer — Sepolia ETH from OPERATOR_PRIVATE_KEY only after execute succeeds. Side-effects (e.g. transfers) belong in step 4 with nativeTransfer, not before commit. Prefer runExecute:false until intent is reviewed; use nativeTransfer only with runExecute:true.",
    {
      agentEns: z
        .string()
        .describe("Registered agent ENS (e.g. treasury.sail.eth)"),
      inputs: z
        .unknown()
        .describe(
          "Everything to bind and later audit: userPrompt, task, constraints, tool outputs, raw context (JSON-serialisable). Becomes inputHash and is copied into auditContext in the sealed blob.",
        ),
      decision: z.string().describe("Conclusion: what you decided and why (the 'thought')."),
      proposedAction: z
        .string()
        .describe("Exact action: hex calldata, tx summary, or structured description."),
      attestation: z.string().optional().describe("0G Compute sealed inference attestation if used."),
      runExecute: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, calls sail_execute immediately after commit. If false, run sail_execute manually after review. Required when using nativeTransfer.",
        ),
      nativeTransfer: z
        .object({
          to: z.string().describe("Recipient 0x address on Sepolia"),
          amountEth: z.string().describe("Amount as decimal ETH string, e.g. 0.0001"),
        })
        .optional()
        .describe(
          "If set, broadcasts native ETH after on-chain execute mines (commit → execute → transfer). Signs with server OPERATOR_PRIVATE_KEY.",
        ),
    },
    async (a) =>
      runSailThinkWithSail({
        agentEns: a.agentEns,
        inputs: a.inputs,
        decision: a.decision,
        proposedAction: a.proposedAction,
        attestation: a.attestation,
        runExecute: a.runExecute,
        nativeTransfer: a.nativeTransfer,
      }),
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // sail_reason_with_sailplus — 0G sealed inference + attestation → commit path
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_reason_with_sailplus",
    "Like sail_think_with_sail but runs reasoning through 0G Compute sealed inference first. The returned attestation is embedded in the Lit/0G commitment blob alongside decision and proposedAction. Requires funded 0G ledger (ZERO_G_PRIVATE_KEY, setup-compute). Prefer sail_think_with_sail when you do not need provider attestation.",
    {
      agentEns: z.string().describe("Registered agent ENS"),
      prompt: z.string().describe("User/task prompt sent to sealed inference"),
      systemPrompt: z.string().optional().describe("Optional system prompt for the inference provider"),
      inputs: z
        .unknown()
        .optional()
        .describe(
          "Extra JSON audit context merged into blob (sealedInference output is added automatically).",
        ),
      decision: z
        .string()
        .optional()
        .describe("Human-readable decision; defaults to the model output from sealed inference"),
      proposedAction: z
        .string()
        .describe("Concrete next step (must match what you will do after execute if using nativeTransfer)"),
      runExecute: z.boolean().optional().default(false),
      nativeTransfer: z
        .object({
          to: z.string(),
          amountEth: z.string(),
        })
        .optional()
        .describe("Same as sail_think_with_sail — requires runExecute: true"),
    },
    async (a) =>
      runSailReasonWithSailPlus({
        agentEns: a.agentEns,
        prompt: a.prompt,
        systemPrompt: a.systemPrompt,
        inputs: a.inputs,
        decision: a.decision,
        proposedAction: a.proposedAction,
        runExecute: a.runExecute,
        nativeTransfer: a.nativeTransfer,
      }),
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Stage 04 — sail_execute
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_execute",
    "Clear the SAIL execution gate after a commitment is on-chain. Fulfilling side-effects (e.g. native ETH) should happen after this tx succeeds — use sail_think_with_sail or sail_reason_with_sailplus with nativeTransfer to enforce that order automatically.",
    {
      agentEns: z.string().describe("Your ENS name"),
      commitmentHash: z
        .string()
        .describe("The commitmentHash returned by sail_commit"),
    },
    async (a) => runSailExecute({ agentEns: a.agentEns, commitmentHash: a.commitmentHash }),
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Stage 06 — sail_audit_commitment (reveal reasoning blob)
  // ─────────────────────────────────────────────────────────────────────────────

  mcp.tool(
    "sail_audit_commitment",
    "Auditor tool: given a commitmentHash, load on-chain metadata + 0G sealed blob. If the blob used AES fallback (Lit unavailable), returns decrypted decision/proposedAction/inputHash and verifies keccak matches commitmentHash. Lit-encrypted blobs return ciphertext metadata only — decrypt in a Lit-capable client.",
    {
      commitmentHash: z
        .string()
        .describe("0x-prefixed commitmentHash from sail_commit or Etherscan"),
    },
    async (a) => runSailAuditCommitment({ commitmentHash: a.commitmentHash }),
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
    async (a) => runSailDeliver({ txBytes: a.txBytes, recipientPeerId: a.recipientPeerId }),
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
    async (a) => runSailDiscover({ ensName: a.ensName }),
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
    async (a) => runSailDelegate({ workerEns: a.workerEns, task: a.task, context: a.context }),
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
    async (a) => runSailReceiveMessages({ since: a.since }),
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
