# SAIL pipeline — audit report

- **Generated:** 2026-05-02T15:55:39.395Z
- **SAIL contract (Sepolia):** `0xaA99758ccD80E8CA9b2142950B04702ff9633990`
- **Agent ENS:** `zen.sail.eth`

## Attestation (stage 01)

### Bound inputs (hashed before commit)

```json
{
  "task": "SAIL pipeline report — automated attest/commit/execute",
  "context": {
    "script": "sail-pipeline-report.ts",
    "generatedAt": "2026-05-02T15:55:08.360Z"
  }
}
```

| Field | Value |
|-------|-------|
| `inputHash` | `0xedcd721f2d61c129e6b9a0343a9e9c8448c0f399e7318fd955ddc002e70ff50c` |
| `timestamp` | 1777737308360 |

## On-chain commitment (SAIL)

| Field | Value |
|-------|-------|
| `commitmentHash` | `0x36317530c490e74ea40813ea032eea4d2dd3365e63db7cee31e15f4edd2be07f` |
| `inputHash` | `0xedcd721f2d61c129e6b9a0343a9e9c8448c0f399e7318fd955ddc002e70ff50c` |
| `cid` (0G root) | `0xa634f1c9fe93dfd48ed31630ddd8f0117c17c0fc71bca45b2d89e6fa3227ba7f` |
| `nonce` | 2 |
| `timestamp` | 1777737324 |
| `executed` | true |

## Commit transaction (stage 03)

- **Tx:** [`0x9800a5200689f85320fc6496ecfd6053fa0740db53cf7adeda7a67e9996e675f`](https://sepolia.etherscan.io/tx/0x9800a5200689f85320fc6496ecfd6053fa0740db53cf7adeda7a67e9996e675f)
- **Post-commit nonce:** 3

## Execute transaction (stage 04)

- **Tx:** [`0xe096049e4dd5c1f094db5d8f5335f50c72efe265dd1d404f517e7d7c89387f7b`](https://sepolia.etherscan.io/tx/0xe096049e4dd5c1f094db5d8f5335f50c72efe265dd1d404f517e7d7c89387f7b)

## Decrypted commitment blob (audit)

- **Decrypt mode:** `aes-fallback`
- **Keccak(plaintext) matches `commitmentHash`:** yes
- **Note:** Plaintext inputHash field matches on-chain inputHash.

### Plaintext fields (decision & action)

| Field | Value |
|-------|-------|
| `inputHash` (in blob) | `0xedcd721f2d61c129e6b9a0343a9e9c8448c0f399e7318fd955ddc002e70ff50c` |
| `agentEns` | `zen.sail.eth` |
| `timestamp` | 1777737308360 |

### Decision

Report demo: document pipeline behaviour; no production side effects.

### Proposed action

none — generate markdown audit report only

## Raw audit payload (JSON)

```json
{
  "commitmentHash": "0x36317530c490e74ea40813ea032eea4d2dd3365e63db7cee31e15f4edd2be07f",
  "onChain": {
    "inputHash": "0xedcd721f2d61c129e6b9a0343a9e9c8448c0f399e7318fd955ddc002e70ff50c",
    "cid": "0xa634f1c9fe93dfd48ed31630ddd8f0117c17c0fc71bca45b2d89e6fa3227ba7f",
    "nonce": "2",
    "timestamp": "1777737324",
    "executed": true
  },
  "decryptMode": "aes-fallback",
  "hashVerified": true,
  "plaintext": {
    "inputHash": "0xedcd721f2d61c129e6b9a0343a9e9c8448c0f399e7318fd955ddc002e70ff50c",
    "decision": "Report demo: document pipeline behaviour; no production side effects.",
    "proposedAction": "none — generate markdown audit report only",
    "agentEns": "zen.sail.eth",
    "timestamp": 1777737308360
  },
  "note": "Plaintext inputHash field matches on-chain inputHash."
}
```
