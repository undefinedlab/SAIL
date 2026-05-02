# SAIL — Current Build Status
**Updated:** May 2, 2026  
**Event:** ETHGlobal Open Agents 2026  
**Partner prizes targeted:** 0G ($15k) · ENS ($5k) · Gensyn/AXL ($5k)  
**Repo:** https://github.com/undefinedlab/SAIL

---

## System Status (live)

| Component | Status | Details |
|---|---|---|
| SAIL Contract | ✅ **Deployed** | `0xaA99758ccD80E8CA9b2142950B04702ff9633990` — Ethereum Sepolia |
| Backend API | ✅ **Running** | `localhost:3001` — tsx watch, hot-reload |
| Frontend | ✅ **Running** | `localhost:3000` — Next.js 14 |
| ENS `sail.eth` | ✅ **Owned** | Operator wallet is Manager on Sepolia ENS app |
| 0G Storage | ✅ **Working** | Galileo testnet — upload/download confirmed |
| 0G Compute | ✅ **Working** | Ledger: 3.0 OG funded, provider acknowledged, inference running |
| Lit Protocol | ⚠️ **Fallback** | `datil-test` nodes unreachable — AES-256-GCM fallback active |
| AXL / Gensyn | ✅ **Online** | Built from source, bridge on `localhost:9002`, peer ID active |

---

## Wallet & Funds

| Asset | Amount |
|---|---|
| ETH (Sepolia) | 3.417 ETH |
| 0G ledger balance | 3.000 OG (provider sub-account funded) |
| SAIL stakes locked | 0.02 ETH (two agents @ 0.01 each) |

---

## Registered Agents (Live on Sepolia)

### `swarnim.sail.eth`
- **Tier:** Optimistic (0)
- **Stake:** 0.01 ETH
- **Commitments:** 2 | **Nonce:** 5 | **Active:** true
- **ENS text records:** `sail_tier=optimistic`, `sail_contract=0xaA99758...`, `capabilities=commit,execute`
- **AXL peer ID:** not set (use Identity tab to set)

### `0x17swarn.sail.eth`
- **Tier:** ZK (1)
- **Stake:** 0.01 ETH
- **Commitments:** 1 | **Active:** true
- **ENS text records:** `sail_tier=zk`, `sail_contract=0xaA99758...`, `auditors=0xc5b7b574...`, `capabilities=commit,execute,audit,delegate`, `axl_peer_id=699a15da...041d84`
- **AXL:** reachable ✅

### `test-agent.sail.eth`
- Throwaway created via API test — has basic ENS records only

All subnames visible in `sail.eth → Subnames` on `sepolia.app.ens.domains` with **Manager** badge.

---

## What Works End-to-End

| Flow | Status |
|---|---|
| Register agent (SAIL contract + ENS subname in one click) | ✅ |
| Attest inputs → SHA256 inputHash | ✅ |
| 0G Compute inference (Qwen 2.5-7B via sealed inference) | ✅ |
| Lit encrypt → AES-256-GCM fallback | ✅ (fallback only) |
| 0G Storage upload (Galileo testnet) | ✅ |
| SAIL contract anchor (commitmentHash on-chain) | ✅ |
| Execute gate (contract reverts without prior commit) | ✅ |
| AXL task delegation (P2P mesh, commitment returned) | ✅ |
| ENS subnames visible in ENS app (NameWrapper wrapped) | ✅ |
| MCP server (stdio + Streamable HTTP at `/mcp`) | ✅ |
| Auditor dashboard — lookup + slash | ✅ |
| TEE attestation verification | ⚠️ testnet providers don't store signatures |

---

## Architecture

```
Operator wallet: 0xc5b7b574EE84A9B59B475FE32Eaf908C246d3859
                 (owns sail.eth, signs all SAIL txs, 0G ledger holder)

┌─────────────────────────────────────────────────────┐
│  Frontend  localhost:3000  (Next.js 14, Wagmi v2)   │
│   /dashboard/operator  →  Register/Pipeline/Mesh    │
│   /dashboard/auditor   →  Lookup/Audit/Slash         │
└──────────────────┬──────────────────────────────────┘
                   │  /api/* proxy
┌──────────────────▼──────────────────────────────────┐
│  Backend   localhost:3001  (Express 4, tsx watch)   │
│                                                     │
│  src/api/routes.ts    ← SAIL pipeline endpoints     │
│  src/api/ens-routes.ts ← ENS CRUD                  │
│  src/api/axl-routes.ts ← AXL mesh + delegation     │
│  src/api/pipeline.ts  ← stages 1-4,6 orchestrator  │
│  src/lit/encrypt.ts   ← Lit + AES-256-GCM fallback │
│  src/mcp/server.ts    ← 8 MCP tools                │
│  src/mcp/http-server.ts ← Streamable HTTP /mcp     │
│  0g/storage.ts        ← Galileo upload/download     │
│  0g/compute.ts        ← sealed inference + retry   │
│  ens/registry.ts      ← NameWrapper-aware subnames │
│  gensyn/client.ts     ← AXL HTTP bridge client     │
│  gensyn/node.ts       ← AXL build + process mgr    │
│  gensyn/task-router.ts ← worker delegation loop    │
└──────────────────┬──────────────────────────────────┘
                   │
       ┌───────────┼────────────────┐
       ▼           ▼                ▼
  Ethereum     0G Galileo       AXL Node
  Sepolia      Testnet          localhost:9002
  (SAIL        (Storage +       (Gensyn P2P mesh
  contract)    Compute)          built from source)
       │           │                │
       └───────────┴────────────────┘
                   │
              ENS (Sepolia)
              sail.eth
              *.sail.eth subnames
```

---

## Pipeline Stages

```
01 Attest    SHA256(inputs) → inputHash
02 Reason    0G Compute sealed inference → output + attestation (ZK tier)
03 Commit    AES/Lit encrypt → 0G Storage upload → SAIL.commit() on Sepolia
04 Execute   SAIL.execute() → reverts if no prior commit (gate enforced)
05 Deliver   AXL P2P message to recipient agent
06 Audit     Fetch blob from 0G → decrypt → keccak256 → compare to on-chain hash
```

---

## MCP Tools (8 total)

| Tool | Description |
|---|---|
| `sail_register` | On-chain agent registration |
| `sail_attest_inputs` | Stage 01 — hash inputs |
| `sail_commit` | Stage 03 — encrypt + upload + anchor |
| `sail_execute` | Stage 04 — contract execute gate |
| `sail_deliver` | Stage 05 — AXL P2P delivery |
| `sail_discover` | ENS agent discovery |
| `sail_delegate` | Delegate task to worker agent via AXL |
| `sail_receive_messages` | Poll AXL inbox |

**Transports:** stdio (`npm run mcp`) · Streamable HTTP (`localhost:3001/mcp`)

---

## Key Technical Decisions & Fixes

**ENS NameWrapper:**  
Modern ENS names are wrapped (registry owner = NameWrapper contract). Fixed by checking `NameWrapper.ownerOf(uint256(namehash))` and using `NameWrapper.getData()` to inherit parent expiry so subnames appear in the ENS app with Manager badge.

**0G Compute ESM broken:**  
`@0gfoundation/0g-compute-ts-sdk` ESM build missing exports. Fixed with `createRequire(import.meta.url)` to force CJS resolution.

**0G Compute reliability:**  
`runSealedInference` tries the configured provider, then auto-picks from all live network providers if it fails. `startAutoFunding` keeps sub-accounts topped up automatically.

**Lit Protocol fallback:**  
`datil-test` nodes unreachable in current environment. `encryptCommitmentBlob()` tries Lit with a 5-second connection attempt, falls back to AES-256-GCM. `decryptAesFallbackBlob()` is available for auditors. Full Lit decryption works once nodes are reachable.

**AXL — build from source:**  
No public binary releases for `gensyn-ai/axl`. Backend auto-clones the repo and runs `go build ./cmd/node/` on first start. Binary is cached at `.axl/repo/node`. Peer ID = 64-char hex ed25519 public key.

**TEE attestation:**  
0G testnet providers don't store per-request signatures at `/v1/proxy/signature/{chatID}`. Verification returns `null` (not false). Will work on mainnet with production providers. Displayed as "TEE sig not stored (testnet)" in UI.

**AXL delegation bug (fixed):**  
Task router was passing the hiring agent's ENS to the worker instead of the worker's own ENS. Worker would try to commit under wrong ENS and fail the SAIL contract call.

**Alchemy in-flight tx limit:**  
Alchemy Sepolia RPC rejects transactions when wallet has too many pending txs. Switched to `publicnode.com` which has no such limit.

---

## ENS API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/ens/config` | Parent name + operator address |
| GET | `/api/ens/owns/:name` | Check operator ownership (NameWrapper-aware) |
| GET | `/api/ens/resolve/:name` | Read SAIL text records |
| POST | `/api/ens/register` | Create wrapped subname (inherits parent expiry) |

---

## Known Limitations

1. **Lit Protocol** — AES fallback works but auditor decrypt requires the fallback key stored in the 0G blob. Full threshold decryption needs `datil-test` nodes to be reachable.
2. **TEE verification** — testnet providers don't implement signature storage. Verification always returns `null` on testnet.
3. **AXL peers: 0** — single node, no other AXL nodes to connect to. Delegation to self works; cross-operator delegation needs a second node.
4. **0G Compute provider 2** (`0x4b2a94...`) — image editing model, not usable for text inference. Only provider 1 (`0xa48f01...`) serves Qwen 2.5-7B.

---

## Files Changed Since Last Commit (clean — everything committed)

```
git log --oneline -5:
202400b audit tool, test pipe?
dc6114c Merge: sail_register MCP tool + SSE reconnect fix
9104f15 Fixed mesh
a4a508a sail_register_mcp
4a12c89 fixes to ens in register
```
