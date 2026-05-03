/**
 * Shared SAIL register + ENS subname path for HTTP /api/register and MCP sail_register.
 * On-chain tx uses OPERATOR_PRIVATE_KEY; ENS subname uses the same operator wallet (must own parent).
 */

import { env } from "../config/env.js";
import * as contract from "../contract/sail.js";
import * as ensRegistry from "../../ens/registry.js";
import type { AgentTextRecords } from "../../ens/registry.js";

export async function registerEnsSubnameForAgentIfApplicable(options: {
  ens: string;
  tier: 0 | 1 | 2;
  auditors: string[];
  skipEns?: boolean;
  /** Merged with sail_tier, sail_contract, auditors (comma-separated list). */
  ensExtraRecords?: AgentTextRecords;
}): Promise<{ txHashes: string[]; pendingRecords?: boolean } | null> {
  const { ens, tier, auditors, skipEns = false, ensExtraRecords } = options;
  if (skipEns) return null;

  const parentName = env.ens.parentName || "sail.eth";
  if (!ens.endsWith(`.${parentName}`)) return null;
  const subLabel = ens.slice(0, -(`.${parentName}`.length));
  if (!subLabel) return null;

  const tierRecord: AgentTextRecords["sail_tier"] =
    tier === 0 ? "optimistic" : tier === 1 ? "sealed" : "tee";
  const records: AgentTextRecords = {
    sail_tier: tierRecord,
    sail_contract: contract.SAIL_ADDRESS,
    auditors: auditors.join(","),
    ...(ensExtraRecords ?? {}),
  };

  try {
    const result = await ensRegistry.registerAgentSubname(parentName, subLabel, records);
    return {
      txHashes: result.txHashes.map((h) => String(h)),
      pendingRecords: result.pendingRecords,
    };
  } catch (ensErr) {
    console.error("[register] ENS subname creation failed:", (ensErr as Error).message);
    return null;
  }
}
