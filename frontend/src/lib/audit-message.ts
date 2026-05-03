/** Default AXL topic for formal SEAL audit handshake (request / accept / deny). */
export const SEAL_AX_TOPIC = "sail.seal.audit";

export type ParsedAuditRequest = {
  requestId: string;
  agentEns: string;
  auditor?: string;
  scope?: string;
  agentIdBytes32?: string;
};

export type ParsedAuditResponse = {
  kind: "accept" | "deny";
  requestId: string;
  agentEns: string;
};

function parseKeyValueLines(body: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && val) map[key] = val;
  }
  return map;
}

/**
 * Formal audit request from auditor → operator over AXL.
 * Includes `requestId` so the operator can Accept / Deny with matching IDs.
 */
export function buildAuditRequestMessage(
  requestId: string,
  agentEns: string,
  auditorAddress: string,
  options?: { scope?: string; agentIdBytes32?: string },
): string {
  const lines = [
    "SEAL — Audit request",
    "",
    `requestId: ${requestId}`,
    `agentEns: ${agentEns}`,
    `auditor: ${auditorAddress}`,
    `scope: ${options?.scope ?? "reveal_all"}`,
  ];
  if (options?.agentIdBytes32) {
    lines.push(`agentId: ${options.agentIdBytes32}`);
  }
  lines.push("", "I request an audit and consent to disclose this signed request to the operator.");
  return lines.join("\n");
}

/** Operator → auditor: consent to the formal request. */
export function buildAcceptMessage(requestId: string, agentEns: string): string {
  return [
    "SEAL — Audit accept",
    "",
    `requestId: ${requestId}`,
    `agentEns: ${agentEns}`,
    "",
    "The operator acknowledges this formal audit request and consents to coordinated disclosure under policy.",
  ].join("\n");
}

/** Operator → auditor: decline the formal request. */
export function buildDenyMessage(requestId: string, agentEns: string): string {
  return [
    "SEAL — Audit deny",
    "",
    `requestId: ${requestId}`,
    `agentEns: ${agentEns}`,
    "",
    "The operator declines this audit reveal request.",
  ].join("\n");
}

/** Parse a formal audit request body (must include requestId + agentEns). */
export function parseAuditRequestMessage(body: string): ParsedAuditRequest | null {
  const t = body.trim();
  if (!t.startsWith("SEAL — Audit request")) return null;
  const kv = parseKeyValueLines(body);
  const requestId = kv.requestId;
  const agentEns = kv.agentEns;
  if (!requestId || !agentEns) return null;
  return {
    requestId,
    agentEns,
    auditor: kv.auditor,
    scope: kv.scope,
    agentIdBytes32: kv.agentId,
  };
}

/** Parse operator responses (accept / deny), including legacy one-line deny. */
export function parseAuditResponseMessage(body: string): ParsedAuditResponse | null {
  const t = body.trim();
  if (t.startsWith("SEAL — Audit accept")) {
    const kv = parseKeyValueLines(body);
    if (!kv.requestId || !kv.agentEns) return null;
    return { kind: "accept", requestId: kv.requestId, agentEns: kv.agentEns };
  }
  if (t.startsWith("SEAL — Audit deny")) {
    const kv = parseKeyValueLines(body);
    if (!kv.requestId || !kv.agentEns) return null;
    return { kind: "deny", requestId: kv.requestId, agentEns: kv.agentEns };
  }
  // Legacy: SEAL deny audit request <id> for agent <bytes32 or ens>
  const legacy = body.match(/SEAL deny audit request\s+(\S+)\s+for agent\s+(.+)/);
  if (legacy) {
    return {
      kind: "deny",
      requestId: legacy[1],
      agentEns: legacy[2].trim(),
    };
  }
  return null;
}

/** Must match `backend/src/audit/audit-types.ts` `buildRevealSubmitMessage`. `plaintextKeccak256` = `keccak256(utf8(plaintext))`. */
export function buildRevealSubmitMessage(
  requestId: string,
  agentIdBytes32: string,
  auditorAddress: string,
  plaintextKeccak256: string,
): string {
  return [
    "SEAL — Submit audit reveal",
    "",
    `requestId: ${requestId}`,
    `agentId: ${agentIdBytes32}`,
    `auditor: ${auditorAddress}`,
    `plaintextKeccak256: ${plaintextKeccak256}`,
  ].join("\n");
}
