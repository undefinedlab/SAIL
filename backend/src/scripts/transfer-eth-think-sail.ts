/**
 * Gated Sepolia transfer: attest → commit → SAIL execute → native ETH (via sail_think_with_sail).
 *
 * Usage (from repo backend/):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx src/scripts/transfer-eth-think-sail.ts <0xTo> [amountEth] [agentEns]
 *
 * agentEns defaults to SAIL_AGENT_ENS or api-test-1777750639.sail.eth — must be registered on SAIL.
 */

import { isAddress, type Address } from "viem";
import { operatorAddress } from "../contract/sail.js";
import { invokeSailMcpTool } from "../mcp/tool-runners.js";

const toRaw = process.argv[2];
const amountEth = process.argv[3] ?? "0.0001";
const agentEns =
  process.argv[4] ?? process.env["SAIL_AGENT_ENS"] ?? "api-test-1777750639.sail.eth";

if (!toRaw || !isAddress(toRaw)) {
  console.error("Usage: transfer-eth-think-sail.ts <0xTo> [amountEth] [agentEns]");
  process.exit(1);
}

const to = toRaw as Address;

/** Pre-transfer snapshot: commitment binds intent before funds move. */
const inputs = {
  task: "Gated Sepolia native ETH transfer under SAIL",
  chainId: 11155111,
  operator: operatorAddress,
  plannedRecipient: to,
  plannedAmountEth: amountEth,
};

const decision =
  "After anchoring intent on-chain and clearing the execute gate, send the specified Sepolia ETH from the operator wallet to the planned recipient.";

const proposedAction = `Native transfer ${amountEth} Sepolia ETH to ${to} (fulfillment after sail_execute)`;

const audit = await invokeSailMcpTool("sail_think_with_sail", {
  agentEns,
  inputs,
  decision,
  proposedAction,
  runExecute: true,
  nativeTransfer: { to, amountEth },
});

console.log(audit.content[0]?.text ?? JSON.stringify(audit));

if (audit.isError) {
  process.exit(1);
}
