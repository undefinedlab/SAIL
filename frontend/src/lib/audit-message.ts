/** Must match `backend/src/audit/audit-types.ts` `buildAuditRequestMessage` */
export function buildAuditRequestMessage(agentIdBytes32: string, auditorAddress: string): string {
  return [
    "SEAL — Audit request",
    "",
    `agentId: ${agentIdBytes32}`,
    "scope: reveal_all",
    `auditor: ${auditorAddress}`,
    "",
    "I request an audit and consent to disclose this signed request to the operator.",
  ].join("\n");
}

/** Must match backend `buildDenyMessage` */
export function buildDenyMessage(requestId: string, agentIdBytes32: string): string {
  return `SEAL deny audit request ${requestId} for agent ${agentIdBytes32}`;
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
