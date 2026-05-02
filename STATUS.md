# SAIL — Current Build Status
**Date:** May 2, 2026  
**Event:** ETHGlobal Open Agents 2026  
**Partner prizes targeted:** 0G ($15k) · ENS ($5k) · Gensyn/AXL ($5k)

---

## What SAIL Is

Secure Agentic Intelligence Layer — a cryptographic accountability layer for AI agents. Every agent must **commit before it executes**: the decision is encrypted, uploaded to 0G Storage, and anchored on-chain. Auditors can later decrypt and verify the full decision trace. Misbehaving agents get slashed.

**Commit-before-execute pipeline:**
```
Attest inputs → (optional 0G Compute reasoning) → Lit encrypt → 0G upload → SAIL anchor → Execute gate → Deliver (AXL) → Audit (decrypt + verify)
```

---

## Live Infrastructure

| Component | Status | Details |
|---|---|---|
| SAIL Contract | **Deployed** | `0xaA99758ccD80E8CA9b2142950B04702ff9633990` — Ethereum Sepolia |
| Backend API | **Running** | `localhost:3001` — tsx watch, auto-reload |
| Frontend | **Running** | `localhost:3000` — Next.js 14 |
| ENS parent | **Owned** | `sail.eth` on Sepolia — operator wallet is manager |
| 0G Storage | **Working** | Galileo testnet — blobs upload and download confirmed |
| 0G Compute | **Blocked** | Needs 3 OG minimum ledger — wallet has 0.640 OG, need faucet top-up |
| Lit Protocol | **Fallback** | Lit `datil-test` nodes unreachable — AES-256-GCM fallback active |
| AXL / Gensyn | **Offline** | Binary not started — `AXL_AUTO_START=false` |

---

## Contract (`contract/src/SAIL.sol`)

- **Language:** Solidity ^0.8.29  
- **Inherits:** OpenZeppelin `ReentrancyGuard`  
- **Address:** `0xaA99758ccD80E8CA9b2142950B04702ff9633990` (Sepolia)  
- **`MINIMUM_STAKE`:** 0.01 ETH

**Key functions:**
| Function | Description |
|---|---|
| `register(ens, tier, auditors) payable` | Register agent with stake lock |
| `commit(ens, commitmentHash, inputHash, cid)` | Anchor commitment on-chain |
| `execute(ens, commitmentHash)` | Release gate — reverts if no commitment |
| `slash(ens) nonReentrant` | Auditor slashes misbehaving agent |
| `isAuthorized(auditor, ens) view` | Used by Lit Protocol as access condition |
| `getAgent(ens) view` | Returns full agent struct |
| `getCommitment(hash) view` | Returns commitment details |

**Custom errors:** `SAIL__AlreadyRegistered`, `SAIL__InsufficientStake`, `SAIL__AgentNotActive`, `SAIL__CommitmentNotFound`, `SAIL__AlreadyExecuted`, `SAIL__NonceMismatch`, `SAIL__NotAuthorizedAuditor`, `SAIL__CommitmentAlreadyExists`, `SAIL__TransferFailed`, `SAIL__NotAgentOperator`, `SAIL__NoAuditors`, `SAIL__NotOwner`

---

## Registered Agents (Live on Sepolia)

### `swarnim.sail.eth`
- **Wallet:** `0xc5b7b574EE84A9B59B475FE32Eaf908C246d3859`
- **Stake:** 0.01 ETH locked
- **Tier:** Optimistic (0)
- **Active:** true
- **Commitment count:** 1
- **Slash count:** 0
- **Current nonce:** 2
- **ENS text records:** `sail_tier=optimistic`, `capabilities=commit,execute,audit,delegate`, `sail_contract=0xaA99758...`

### `test-agent.sail.eth`
- Created via API test — throwaway
- **ENS text records:** `sail_tier=optimistic`, `capabilities=commit,execute`

Both subnames appear in `sail.eth → Subnames` on `sepolia.app.ens.domains` with **Manager** badge.

---

## Backend (`backend/`)

**Runtime:** Node.js 22 + tsx watch (hot-reload)  
**Framework:** Express 4  
**Port:** 3001

### Folder structure
```
backend/
  src/
    api/
      routes.ts          ← main SAIL pipeline endpoints
      ens-routes.ts      ← ENS CRUD endpoints
      axl-routes.ts      ← AXL mesh endpoints
      pipeline.ts        ← pipeline orchestrator (stages 1-4,6)
    contract/
      sail.ts            ← viem SAIL contract adapter
    lit/
      encrypt.ts         ← Lit encryption + AES fallback
    mcp/
      server.ts          ← MCP stdio server (6 tools)
      index.ts           ← MCP entry point
    config/
      env.ts             ← typed env with required/optional helpers
    index.ts             ← Express server entry
  0g/
    storage.ts           ← 0G Storage upload/download (Galileo testnet)
    compute.ts           ← 0G Compute sealed inference (CJS workaround)
  ens/
    registry.ts          ← ENS adapter (NameWrapper-aware)
  gensyn/
    client.ts            ← AXL HTTP bridge client
    node.ts              ← AXL binary downloader + process manager
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Backend health, contract addr, operator addr, AXL status |
| POST | `/api/register` | Register agent with SAIL contract |
| GET | `/api/agents/:ens` | Read agent state + nonce |
| GET | `/api/commitments/:hash` | Read commitment |
| POST | `/api/attest` | Stage 1 — SHA256 input hash |
| POST | `/api/reason` | Stage 2 — 0G Compute inference |
| POST | `/api/commit` | Stage 3 — Lit encrypt + 0G upload + SAIL anchor |
| POST | `/api/execute` | Stage 4 — SAIL contract execute gate |
| GET | `/api/reveal/:cid` | Stage 6 — fetch encrypted blob for auditor |
| GET | `/api/compute/providers` | List 0G Compute providers |
| GET | `/api/ens/config` | Operator ENS config (parent name + address) |
| GET | `/api/ens/owns/:name` | Check if operator owns ENS name |
| GET | `/api/ens/resolve/:name` | Read SAIL text records |
| POST | `/api/ens/register` | Create ENS subname under sail.eth |
| GET | `/api/axl/status` | AXL mesh topology |
| POST | `/api/axl/send` | Send AXL message |
| GET | `/api/axl/messages` | Poll inbox |

### Key technical decisions

**0G Compute — CJS workaround:**  
The `@0gfoundation/0g-compute-ts-sdk` ESM build is broken. Fix: `createRequire(import.meta.url)` to force CJS resolution.

**ENS NameWrapper-aware subname creation:**  
Modern ENS names (including `sail.eth`) are wrapped. Registry `owner()` returns the NameWrapper contract, not the user. Fixed by:
1. `getOwner()` checks registry, then calls `NameWrapper.ownerOf(uint256(namehash))` if registry points to NameWrapper
2. `registerAgentSubname()` routes through `NameWrapper.setSubnodeRecord()` for wrapped parents
3. Inherits parent's expiry via `NameWrapper.getData(uint256)` → subnames appear in ENS app as wrapped (Manager badge)
4. `setAddr` + `setText` run in background after first tx confirms — HTTP response returns in ~20s instead of 2-3min

**Lit Protocol — AES fallback:**  
`datil-test` nodes unreachable in current environment. `encryptCommitmentBlob()` tries Lit first (5s timeout), falls back to AES-256-GCM with random key. Fallback key is stored in the blob metadata uploaded to 0G Storage.

**Error messages — viem revert parsing:**  
`contractError(err)` regex-extracts `SAIL__FooBar` from viem's verbose revert messages. Frontend `friendlyError()` maps all 12 custom errors to human-readable strings.

---

## Frontend (`frontend/`)

**Framework:** Next.js 14 (App Router)  
**Wallet:** Wagmi v2 + RainbowKit v2  
**Chain:** Ethereum Sepolia (chainId 11155111)  
**Proxy:** `/api/*` → `localhost:3001/api/*` via Next.js rewrites

### Pages
| Route | Description |
|---|---|
| `/` | Landing + mission control |
| `/dashboard/operator` | Operator dashboard |
| `/dashboard/auditor` | Auditor dashboard |

### Operator Dashboard tabs
| Tab | Function |
|---|---|
| **Register** | Register agent with SAIL contract (min 0.01 ETH stake) |
| **Pipeline** | Full commit path: attest → optional 0G reasoning → commit → execute |
| **Monitor** | Read agent state + nonce live from chain |
| **Identity** | Create ENS subnames under sail.eth + write text records |
| **Mesh** | AXL mesh topology + send/receive messages |

### Auditor Dashboard tabs
| Tab | Function |
|---|---|
| **Lookup** | Look up any agent by ENS name |
| **Audit** | Fetch encrypted blob from 0G → reveal via Lit → hash verify |
| **Slash** | Slash misbehaving agent directly via connected wallet |

### Key frontend files
```
frontend/src/
  app/
    page.tsx                     ← landing
    dashboard/operator/page.tsx
    dashboard/auditor/page.tsx
  components/
    dashboard/
      SailOperatorPanel.tsx      ← 5-tab operator console
      SailAuditorPanel.tsx       ← 3-tab auditor console
      ProtocolStages.tsx         ← protocol stage explainer
      InfraOverview.tsx          ← infra status display
  lib/
    sail-api.ts                  ← all backend API calls
    sail-abi.ts                  ← SAIL contract ABI (viem parseAbi)
    wagmi-config.ts              ← wagmi + RainbowKit setup
    hooks/useBackendStatus.ts    ← polls /health every 5s
```

---

## ENS Setup (Sepolia)

| Name | Status | Owner |
|---|---|---|
| `sail.eth` | Registered, expires May 2 2027 | `0xc5b7b574...3859` |
| `swarnim.sail.eth` | Active subname, wrapped (Manager) | `0xc5b7b574...3859` |
| `test-agent.sail.eth` | Active subname, wrapped (Manager) | `0xc5b7b574...3859` |

**How subnames are created:**
1. Check if parent is wrapped: `ENSRegistry.owner(node) == NAME_WRAPPER`
2. Fetch parent expiry: `NameWrapper.getData(uint256(parentNode))` → `(owner, fuses, expiry)`
3. Create wrapped subname: `NameWrapper.setSubnodeRecord(parentNode, label, owner, resolver, ttl=0, fuses=0, expiry=parentExpiry)`
4. Background: `PublicResolver.setAddr(subNode, wallet)` + `setText(subNode, key, value)` × N

---

## MCP Server (`backend/src/mcp/`)

Transport: stdio  
Start: `npm run mcp`

**6 tools exposed to agent frameworks:**
| Tool | Description |
|---|---|
| `sail_attest_inputs` | Hash inputs → inputHash |
| `sail_commit` | Full commit: encrypt + upload + anchor |
| `sail_execute` | Execute through contract gate |
| `sail_deliver` | AXL message delivery |
| `sail_discover` | Look up agent by ENS name |
| `sail_delegate` | Delegate task to another SAIL agent |
| `sail_receive_messages` | Poll AXL inbox |

---

## What's Blocking / Needs Work

### 1. 0G Compute ledger (BLOCKING for ZK tier demo)
- Wallet has **0.640 OG** on OG-Testnet-Galileo
- Minimum to create ledger: **3 OG**
- Need faucet top-up at `faucet.0g.ai`
- Once funded: `cd backend && npm run setup-compute`
- Two providers found: `0xa48f01...` and `0x4b2a94...`

### 2. Lit Protocol (non-blocking — fallback working)
- AES-256-GCM fallback is active and pipeline runs end-to-end
- For full demo: Lit `datil-test` nodes need to be reachable
- SDK version: `@lit-protocol/*@7.4.0` (downgraded from broken alpha 8.0.0)
- May need a Lit API key or different network config

### 3. AXL / Gensyn mesh (non-blocking for core demo)
- Binary not running — shows "offline" in dashboard
- Need to start AXL node: `AXL_AUTO_START=true` in `.env` or manual start
- Required for Gensyn prize qualification

### 4. Git commit (pending)
- All code changes since last commit are uncommitted
- Need: `git add -A && git commit` to checkpoint current state

### 5. Contract not verified on Etherscan
- Source not published → method IDs not decoded on Etherscan
- Run: `forge verify-contract 0xaA99758... src/SAIL.sol:SAIL --chain sepolia`

---

## Pipeline — Verified Working End-to-End

```
✅ POST /api/attest         → inputHash: 0x7030975a...
✅ POST /api/commit         → commitmentHash: 0x3861b7b0...
                              cid: 0xd7b05e5c... (0G Storage Galileo)
                              txHash: 0x9ba2ea4b... (Sepolia)
                              nonce: 1 → 2
✅ GET  /api/agents/swarnim.sail.eth → active=true, commitmentCount=1
✅ GET  /api/ens/resolve/swarnim.sail.eth → text records confirmed
✅ ENS subnames visible in sepolia.app.ens.domains under sail.eth
```

---

## Environment Variables Required

```bash
# backend/.env
SAIL_CONTRACT_ADDRESS=0xaA99758ccD80E8CA9b2142950B04702ff9633990
SAIL_CHAIN_ID=11155111
ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
OPERATOR_PRIVATE_KEY=0x...
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZERO_G_PRIVATE_KEY=0x...
LIT_NETWORK=datil-test
ENS_PARENT_NAME=sail.eth

# frontend/.env.local
NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS=0xaA99758ccD80E8CA9b2142950B04702ff9633990
NEXT_PUBLIC_ENS_PARENT_NAME=sail.eth
SAIL_API_PROXY_TARGET=http://localhost:3001
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```
