/**
 * One-shot local run of sail_reason_with_sailplus (0G sealed inference → commit).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/probe-reason-sailplus.ts [agentEns]
 */

import { invokeSailMcpTool } from "../mcp/tool-runners.js";

const agentEns =
  process.argv[2] ?? process.env["SAIL_AGENT_ENS"] ?? "api-test-1777750639.sail.eth";

const r = await invokeSailMcpTool("sail_reason_with_sailplus", {
  agentEns,
  prompt: "Reply with exactly one word: SAILPLUS",
  systemPrompt: "You are a concise assistant.",
  inputs: { task: "probe sail_reason_with_sailplus", source: "probe-reason-sailplus.ts" },
  proposedAction:
    "Probe only: commit with 0G sealed inference output + attestation when available; no execute or transfer.",
  runExecute: false,
});

console.log(r.content[0]?.text ?? JSON.stringify(r));
if (r.isError) process.exit(1);
