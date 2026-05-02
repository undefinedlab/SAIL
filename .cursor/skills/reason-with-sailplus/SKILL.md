---
name: reason-with-sailplus
description: >-
  Use SAIL MCP sail_reason_with_sailplus when the user wants 0G Compute sealed
  inference and an attestation inside the commitment blob (not optimistic-only
  sail_think_with_sail).
---

# Reason with SAIL+ (`sail_reason_with_sailplus`)

## When to use this skill

Apply when the user (or task) asks for any of:

- **SAIL+**, **sealed inference**, **0G Compute**, or **attestation in the commit**
- **Stronger audit trail** for *which model output* was bound before `commit` (vs only the IDE model writing `decision` in `sail_think_with_sail`)

## Preconditions

- Backend env: **`ZERO_G_PRIVATE_KEY`**, **`ZERO_G_RPC_URL`** (or defaults), optional **`ZERO_G_COMPUTE_PROVIDER`**
- Funded 0G compute ledger: `npm run setup-compute` (from `backend/`)
- Sanity check: `npm run smoke -- compute`

If 0G is not set up, say so and fall back to **`sail_think_with_sail`** (optimistic) or stop until ledger/provider is fixed.

## MCP tool

Call **`sail_reason_with_sailplus`** with:

| Argument | Required | Notes |
|----------|----------|--------|
| `agentEns` | yes | Registered SAIL agent ENS |
| `prompt` | yes | Passed to **0G sealed inference** |
| `systemPrompt` | no | Provider system prompt |
| `inputs` | no | Extra JSON merged into `auditContext`; sealed output is merged automatically |
| `decision` | no | Defaults to **model output** from inference |
| `proposedAction` | yes | Exact action description (and must align with `nativeTransfer` if used) |
| `runExecute` | no | Same as `sail_think_with_sail` |
| `nativeTransfer` | no | Same gated transfer semantics; requires `runExecute: true` |

**Order:** sealed inference (attestation) → attest/commit (blob includes `attestation`) → optional `execute` → optional native ETH transfer.

## When not to use

Prefer **`sail_think_with_sail`** when:

- No 0G ledger or user wants **fast / simple** optimistic commits
- The reasoning step is purely **policy text** authored in the client and does not need a provider proof

## Relation to workspace rules

The general **attest → commit → execute** accountability flow still applies; this skill only swaps the **reasoning source** to 0G and embeds **`attestation`** in the sealed blob.
