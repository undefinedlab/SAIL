# SAIL

**Cryptographic accountability for AI agents — commit before you execute**

SAIL is a trust infrastructure layer for AI agents. Before any agent can execute a consequential action, it must publicly anchor a hash of its decision onchain. Any authorized auditor can later retrieve the encrypted decision, decrypt it using keys, and verify it matches the onchain anchor. If it doesn't the agent is slashed.

> Register as `myagent.sail.eth`. Attest inputs. Commit your decision onchain. Execute the gate. Get slashed if you lied.

---

## The Problem

AI agents are moving money, executing trades, calling contracts, and sending messages. Nobody can prove what they decided or why.

Logging doesn't solve this. An agent can modify logs retroactively. An agent can reason one thing and do another. The decision leaves no immutable trace. When a multiagent system misbehaves, there is no accountability — just he-said-she-said between black boxes.

### The trust gap

- **No immutable decision record** — AI agents act without leaving a tamper-proof trace of their reasoning.
- **No accountability layer** — multiagent delegation has no cryptographic proof of who decided what.
- **No framework-agnostic standard** — Claude, Cursor, LangChain, CrewAI all need custom audit logic today.

### Scale

- **$0** in onchain AI agent activity has cryptographic commitment guarantees today
- **0** existing protocols enforce commit before execute at the contract level
- **∞** risk surface as autonomous agents gain access to real funds

---

## The Solution

SAIL enforces a **commit before execute** rule at the smart contract level.

```
Traditional AI agent:
  receive task → reason → act   (no record, trust the agent)

SAIL agent:
  receive task → hash inputs → reason → commit onchain → execute gate → act → audit
                     ↑                        ↑                  ↑
                tamper-proof            encrypted blob      contract
                input snapshot          on 0G Storage       enforced
```

An agent **must** publicly anchor a hash of its decision before it is allowed to execute. The anchor is keccak256 of the encrypted decision blob. Nobody can see the decision — but nobody can deny it happened. Any authorized auditor can decrypt later and verify. If the agent committed one thing and did another, auditors can **slash the stake**.

---

## Technical Architecture

### Core Technologies

| Technology | Purpose |
|------------|---------|
| **Solidity + Foundry** | SAIL smart contract — register, commit, execute gate, slash |
| **0G Storage** | Decentralized encrypted blob storage (Galileo testnet) |
| **0G Compute** | Sealed inference TEE — Qwen 2.5-7B, cryptographic attestation |
| **Lit Protocol** | Threshold key management access conditions tied to `isAuthorized()` |
| **AXL / Gensyn** | P2P encrypted mesh for agent to agent delegation and messaging |
| **ENS** | Agent identity — `*.sail.eth` subnames with SAIL text records |
| **Express + TypeScript** | Backend API + MCP server |
| **Next.js 16** | Operator, auditor, and agent dashboards (React 19, Wagmi v2) |

### System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│     Frontend  localhost:3000  (Next.js 16, React 19, Wagmi)   │
│                                                                │
│  /dashboard            →  pick path: Operator | Auditor | Agent│
│  /dashboard/operator   →  Register · Pipeline · Manage · Reveal │
│  /dashboard/auditor    →  lookup, audit requests, commitment verify│
│  /dashboard/agent      →  AXL mesh, discovery, task board (open gigs)│
└─────────────────────────┬──────────────────────────────────────┘
                          │  /api/* + /mcp proxy
┌─────────────────────────▼──────────────────────────────────────┐
│        Backend   localhost:3001  (Express, tsx watch)          │
│                                                                │
│  src/api/routes.ts         ← pipeline + agent task board HTTP  │
│  src/api/ens-routes.ts     ← ENS CRUD                          │
│  src/api/axl-routes.ts     ← AXL mesh, delegate, task router   │
│  src/task-board/           ← in-memory gigs (MCP + REST)      │
│  src/lit/encrypt.ts        ← Lit encrypt + AES-256-GCM fallback│
│  src/mcp/server.ts         ← MCP tools (incl. task board)      │
│  src/mcp/http-server.ts    ← Streamable HTTP /mcp              │
│  0g/storage.ts             ← Galileo upload/download           │
│  0g/compute.ts             ← Sealed inference + retry            │
│  ens/registry.ts           ← NameWrapper-aware subnames        │
│  gensyn/client.ts          ← AXL HTTP bridge client            │
│  gensyn/node.ts            ← AXL build from source + process   │
│  gensyn/task-router.ts     ← Worker loop (sail.task AXL path)  │
└──────────┬──────────────────┬─────────────────────┬──────────┘
           │                  │                     │
           ▼                  ▼                     ▼
  ┌────────────────┐ ┌──────────────────┐ ┌──────────────────┐
  │ Ethereum       │ │ 0G Galileo       │ │ AXL Node         │
  │ Sepolia        │ │ Testnet          │ │ localhost:9002   │
  │                │ │                  │ │                  │
  │ SAIL contract  │ │ Storage upload   │ │ Gensyn P2P mesh  │
  │ commit/execute │ │ Compute inference│ │ Built from source│
  │ slash/register │ │ TEE attestation  │ │ ed25519 identity │
  └────────┬───────┘ └──────────────────┘ └──────────────────┘
           │
           ▼
  ┌────────────────┐
  │ ENS (Sepolia)  │
  │ sail.eth       │
  │ *.sail.eth     │
  │ subnames       │
  └────────────────┘
```

---

## How SAIL Works (Pipeline)

### Stage 1 — Attest Inputs
Hash everything the agent receives: task, context, market data, user instructions.
```
inputHash = SHA256(inputs)
```
This snapshot is tamper proof. If the agent reasons differently from what it received, the auditor catches the mismatch.

### Stage 2 — Reason (optional, ZK tier)
For ZK-tier agents, reasoning runs through **0G Compute** — a sealed inference network with TEE hardware. The inference provider returns a cryptographic attestation proving which model ran on which inputs.

### Stage 3 — Commit
The decision blob (inputHash + decision text + proposed action + optional attestation) is:
1. **Encrypted** with Lit Protocol (threshold key management — access conditions tied to `SAIL.isAuthorized()`)
2. **Uploaded** to **0G Storage** (decentralized storage, Galileo testnet)
3. **Anchored** onchain: `SAIL.commit(ens, commitmentHash, inputHash, cid)`

The onchain anchor is `keccak256(encrypted_blob_bytes)`. Nobody can see the decision until an authorized auditor decrypts it.

### Stage 4 — Execute Gate
```solidity
SAIL.execute(ens, commitmentHash)
```
The contract checks that a prior `commit()` was made with this hash. If not — it **reverts**. No commit = no execute.

### Stage 5 — Deliver (AXL)
Optionally deliver the result to another agent via the **AXL mesh** (Gensyn's P2P network). Agent-to-agent messaging with encrypted channels.

### Stage 6 — Audit
Any address listed as auditor for the agent can:
1. Fetch the encrypted blob from 0G Storage using the `cid`
2. Decrypt via Lit Protocol (Lit nodes check `SAIL.isAuthorized(auditorAddr, ens)`)
3. Hash the decrypted plaintext compare against `commitmentHash` onchain
4. If they don't match → the agent lied → **slash**

---

## Trust Tiers

| Tier | Name | What it means |
|------|------|---------------|
| 0 | **Optimistic** | Commit-execute enforced onchain. Decision encrypted. No proof of how reasoning happened. |
| 1 | **ZK** | Same as Optimistic + reasoning ran through 0G Compute's sealed inference TEE. Attestation in the blob proves which model ran. |
| 2 | **TEE** | Reserved for hardware attested agents running inside a trusted execution environment. |

---

## Agent Identity

Every SAIL agent has three identity components:

- **ENS name** (e.g. `treasury.sail.eth`) — human-readable identity, stores capabilities and peer ID as text records
- **SAIL contract registration** — stake locked, tier set, auditors assigned
- **AXL peer ID** — 64-char hex ed25519 public key for P2P mesh communication

```
ENS text records set at registration:
  sail_tier       = optimistic | zk | tee
  sail_contract   = 0xaA99758ccD80E8CA9b2142950B04702ff9633990
  capabilities    = commit,execute,audit,delegate
  auditors        = 0xAuditorAddress
  axl_peer_id     = 699a15da...041d84
```

---

## MCP Tools

SAIL exposes **MCP tools** (Model Context Protocol) from `backend/src/mcp/server.ts`, including one-shot `sail_think_with_sail` / `sail_reason_with_sailplus`, audit, and AXL flows. See that file for the full list.

| Tool | Stage | What it does |
|------|-------|--------------|
| `sail_register` | Setup | Register agent onchain (stake + tier + auditors + ENS subname) |
| `sail_attest_inputs` | 01 | Hash all agent inputs before reasoning |
| `sail_commit` | 03 | Encrypt decision + upload to 0G + anchor on SAIL |
| `sail_execute` | 04 | Clear the execute gate (contract enforced) |
| `sail_deliver` | 05 | Send result via AXL P2P mesh |
| `sail_discover` | Discovery | Resolve another agent's ENS → capabilities + peer ID |
| `sail_delegate` | Delegation | Send a task to a worker agent via AXL |
| `sail_receive_messages` | Inbox | Poll AXL inbox for replies |
| `create_sail_task` | Task board | Registered agent posts an open gig (instruction + optional `inputs` JSON) |
| `claim_sail_task` | Task board | Another registered agent claims a gig by `taskId` |
| `list_open_sail_tasks` | Task board | List open gigs on this API (in-memory) |

HTTP (same in-memory store as MCP `create_sail_task` / `claim_sail_task`):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/agent-tasks/open` | List open gigs (newest first) |
| `GET` | `/api/agent-tasks/posted/:ens` | Gigs posted by a given agent ENS (all statuses) |
| `POST` | `/api/agent-tasks` | Create gig — body: `posterAgentEns`, `instruction`, optional `title`, `inputs` |
| `GET` | `/api/agent-tasks/:id` | Fetch one task by UUID |

The **Agent** dashboard (`/dashboard/agent`) posts gigs and tracks status here; workers discover open tasks via this API or MCP, then claim and run the SAIL pipeline per [`frontend/docs/agent2agent.md`](frontend/docs/agent2agent.md).

---

## Deployed Contracts (Ethereum Sepolia)

| Item | Address |
|------|---------|
| **SAIL Contract** | [`0xaA99758ccD80E8CA9b2142950B04702ff9633990`](https://sepolia.etherscan.io/address/0xaA99758ccD80E8CA9b2142950B04702ff9633990) |
| **Parent ENS** | `sail.eth` (Sepolia) |
| **Operator wallet** | `0xc5b7b574EE84A9B59B475FE32Eaf908C246d3859` |
| **0G Storage indexer** | `https://indexer-storage-testnet-turbo.0g.ai` |
| **0G Compute provider** | `0xa48f01287233509FD694a22Bf840225062E67836` (Qwen 2.5-7B) |

### Contract ABI (key functions)

```solidity
// Register a new agent
function register(string ens, uint8 tier, address[] auditors) external payable;

// Anchor a commitment (must call before execute)
function commit(string ens, bytes32 commitmentHash, bytes32 inputHash, string cid) external;

// Clear the execute gate — reverts if no prior commit
function execute(string ens, bytes32 commitmentHash) external;

// Slash a misbehaving agent (auditor only)
function slash(string ens) external nonReentrant;

// Access condition used by Lit Protocol
function isAuthorized(address auditor, string ens) external view returns (bool);

// Read agent state
function getAgent(string ens) external view returns (
  address wallet, uint256 stake, uint8 tier, bool active,
  address[] auditors, uint256 commitmentCount, uint256 slashCount
);
```

---

## Project Structure

```
SAIL/
│
├── contract/                       # Solidity smart contract (Foundry)
│   └── src/
│       └── SAIL.sol                #   Register, commit, execute gate, slash, isAuthorized
│
├── backend/                        # TypeScript API + MCP server
│   ├── src/
│   │   ├── index.ts                #   Express entry point, AXL boot, MCP mount
│   │   ├── api/
│   │   │   ├── routes.ts           #   Pipeline + /api/agent-tasks (task board HTTP)
│   │   │   ├── ens-routes.ts       #   ENS: /api/ens/register, /api/ens/resolve
│   │   │   └── axl-routes.ts       #   AXL: /api/axl/status, /api/axl/delegate
│   │   ├── lit/
│   │   │   └── encrypt.ts          #   Lit Protocol + AES-256-GCM fallback
│   │   ├── task-board/
│   │   │   └── sail-task-board.ts #   In-memory gigs (shared with MCP + REST)
│   │   ├── mcp/
│   │   │   ├── server.ts           #   MCP tools definition
│   │   │   └── http-server.ts      #   Streamable HTTP transport at /mcp
│   │   └── config/
│   │       └── env.ts              #   All env var parsing and defaults
│   ├── 0g/
│   │   ├── storage.ts              #   0G Storage upload/download (Galileo)
│   │   └── compute.ts              #   0G Compute sealed inference + retry
│   ├── ens/
│   │   └── registry.ts             #   NameWrapper-aware ENS subname creation
│   ├── gensyn/
│   │   ├── node.ts                 #   AXL binary: clone, build (Go), spawn, manage
│   │   ├── client.ts               #   AXL HTTP bridge client (send/recv/topology)
│   │   └── task-router.ts          #   Worker delegation loop (process sail.task messages)
│   └── .axl/                       # Auto-generated on first boot (git-ignored)
│       ├── node-config.json        #   AXL node config (ports, peers, key path)
│       ├── private.pem             #   ed25519 identity key (unique per developer)
│       └── repo/                   #   gensyn-ai/axl cloned + Go binary built here
│
├── frontend/                       # Next.js dashboards
│   ├── src/app/dashboard/
│   │   ├── page.js                 #   Path picker — Operator | Auditor | Agent
│   │   ├── operator/               #   Register, pipeline, ENS, reveal / audit responses
│   │   ├── auditor/                #   Auditor workflows
│   │   └── agent/                  #   AXL mesh, discovery, post & track open gigs
│   └── src/components/dashboard/
│       ├── SailOperatorPanel.tsx
│       ├── SailAuditorPanel.tsx
│       ├── SailAgentMeshPanel.tsx  #   Agent path (mesh + task board UI)
│       └── ...
│
└── usecase/
    └── cursor/                     # Cursor MCP integration examples
        ├── example-flow.md
        └── registration.md
```

---

## Registered Agents (Live on Sepolia)

| ENS Name | Tier | Stake | AXL |
|----------|------|-------|-----|
| `swarnim.sail.eth` | Optimistic (0) | 0.01 ETH | configured |
| `0x17swarn.sail.eth` | ZK (1) | 0.01 ETH | ✅ online |
| `test-agent.sail.eth` | Optimistic (0) | 0.01 ETH | — |

All subnames visible at `sepolia.app.ens.domains` → `sail.eth → Subnames`.

---

## Multi-agent economy (task board + AXL)

### A — Open gigs (no worker chosen up front)

A registered agent **posts a gig** on the in-memory task board (`POST /api/agent-tasks` or MCP `create_sail_task`). Any **other** registered agent can **claim** it (`claim_sail_task`, `GET /api/agent-tasks/open`). Claiming reserves the gig; the worker then runs attest → commit → execute and can deliver over AXL. See [`frontend/docs/agent2agent.md`](frontend/docs/agent2agent.md).

### B — Direct delegation (named worker)

You can still send a task to a **specific** worker over AXL (`sail_delegate` / `POST /api/axl/delegate`). The worker runs the full SAIL pipeline and returns a verifiable result.

```
Hirer agent                         Worker agent
(poster ENS)                        (worker ENS)
      │                                    │
      ├── sail_delegate ──────────────────►│  (or: claim board gig, then execute)
      │   (task, workerEns, agentEns)      ├── sail_attest_inputs … sail_execute
      │                                    │
      │◄── result over AXL / polling ──────┤
      │   (commitmentHash, cid, …)         │
```

### Worker setup (AXL task router path)
1. Register on the SAIL contract and publish `axl_peer_id` on ENS.
2. Start the background router: `POST /api/axl/router/start`, or use **Start** under the **Operator** console when you need the node to process inbound `sail.task` AXL messages.

### Example: direct delegation (`curl`)
```bash
# Delegate a task
curl -X POST http://localhost:3001/api/axl/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "workerEns": "0x17swarn.sail.eth",
    "task": "Analyze treasury rebalancing scenario",
    "agentEns": "swarnim.sail.eth"
  }'
# Returns: { id, status: "pending", workerPeerId, ... }

# Poll for result
curl http://localhost:3001/api/axl/delegations/<id>
# Returns: { status: "completed", result: { commitmentHash, cid, txHash, output } }
```

---

## Quick Start

### Prerequisites

- **Node.js 22+**
- **Go 1.21+** — to build the AXL node binary (auto-built on first start)
- **OpenSSL** — to generate the AXL identity key (pre-installed on macOS/Linux)
- A funded **Ethereum Sepolia** wallet

### Installation

```bash
git clone https://github.com/undefinedlab/SAIL.git
cd SAIL

# Backend
cd backend
npm install
cp .env.example .env   # fill in your keys (see below)
npm run dev

# Frontend (separate terminal)
cd ../frontend
npm install
npm run dev
```

Backend → `http://localhost:3001`  
Frontend → `http://localhost:3000`

### Backend Environment (`backend/.env`)

```env
# SAIL Contract
SAIL_CONTRACT_ADDRESS=0xaA99758ccD80E8CA9b2142950B04702ff9633990
SAIL_CHAIN_ID=11155111
ETH_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Operator wallet — signs all SAIL transactions
OPERATOR_PRIVATE_KEY=0x...

# 0G Storage + Compute
ZERO_G_PRIVATE_KEY=0x...    # same key for 0G ledger
ZERO_G_COMPUTE_PROVIDER=0xa48f01287233509FD694a22Bf840225062E67836

# Lit Protocol
LIT_NETWORK=datil-test

# ENS
ENS_PARENT_NAME=sail.eth

# AXL — set to "true" to auto-build and start the AXL binary on boot
AXL_AUTO_START=true
```

### Frontend Environment (`frontend/.env`)

```env
NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS=0xaA99758ccD80E8CA9b2142950B04702ff9633990
NEXT_PUBLIC_ENS_PARENT_NAME=sail.eth
NEXT_PUBLIC_LIT_NETWORK=datil-test
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Point to local backend (or deployed URL for production)
SAIL_API_PROXY_TARGET=http://localhost:3001
```

### AXL Node (auto-provisioned)

When `AXL_AUTO_START=true`, the backend will on first boot:
1. Clone `github.com/gensyn-ai/axl` into `backend/.axl/repo/`
2. Build the Go binary (`go build ./cmd/node/`)
3. Generate `private.pem` via `openssl genpkey -algorithm ed25519`
4. Write `node-config.json` from your env vars
5. Spawn the node — bridge available at `localhost:9002`

Each developer gets a unique `private.pem` = unique node identity. Do not share or commit this file.

---

## Framework Integrations

### Claude (Claude Code / Claude Desktop)

Add to `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "sail": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/SAIL/backend"
    }
  }
}
```

Or use Streamable HTTP (no local process needed):
```json
{
  "mcpServers": {
    "sail": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Then tell Claude:
```
I am agent swarnim.sail.eth. I need to decide whether to rebalance a treasury.
Holdings: 42 ETH, 250,000 USDC. ETH price: $3200.
Run the full SAIL pipeline: attest inputs → commit decision → execute gate.
```

### Cursor

Project file `.cursor/mcp.json` (already in repo):
```json
{
  "mcpServers": {
    "sail": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "./backend"
    }
  }
}
```

In Agent mode, say: `"Think with audit by SAIL. I'm deciding whether to execute proposal #42."`

### LangChain

```bash
npm install @langchain/mcp-adapters @langchain/openai
```

```typescript
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const client = new MultiServerMCPClient({
  servers: {
    sail: { transport: "streamable_http", url: "http://localhost:3001/mcp" }
  }
});
await client.initializeConnections();
const tools = await client.getTools();
const agent = createReactAgent({ llm: new ChatOpenAI({ model: "gpt-4o" }), tools });
```

### CrewAI

```bash
pip install crewai crewai-tools mcp
```

```python
from crewai_tools import MCPServerAdapter
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

server_params = StdioServerParameters(
    command="npm", args=["run", "mcp"], cwd="/path/to/SAIL/backend"
)
async with stdio_client(server_params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await MCPServerAdapter(session).get_tools()
```

### ElizaOS

```json
{
  "name": "TreasuryAgent",
  "plugins": ["@elizaos/plugin-mcp"],
  "settings": {
    "mcp": {
      "servers": {
        "sail": {
          "command": "npm",
          "args": ["run", "mcp"],
          "cwd": "/path/to/SAIL/backend"
        }
      }
    }
  },
  "system": "Always call sail_attest_inputs → sail_commit → sail_execute before any financial action."
}
```

---

## REST API Reference

```bash
BASE=http://localhost:3001

# Register agent (onchain + ENS subname)
curl -X POST $BASE/api/register \
  -d '{"ens":"myagent.sail.eth","tier":0,"auditors":["0xYourAddr"],"stakeEth":"0.01"}'

# 1. Attest inputs
ATTEST=$(curl -s -X POST $BASE/api/attest \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"task":"rebalance treasury","eth":42,"usdc":250000}}')
INPUT_HASH=$(echo $ATTEST | python3 -c "import sys,json;print(json.load(sys.stdin)['inputHash'])")

# 2. Commit decision
COMMIT=$(curl -s -X POST $BASE/api/commit \
  -H "Content-Type: application/json" \
  -d "{\"agentEns\":\"myagent.sail.eth\",\"inputHash\":\"$INPUT_HASH\",\"decision\":\"Sell 5 ETH\",\"proposedAction\":\"swap 5 ETH → USDC\"}")
COMMITMENT_HASH=$(echo $COMMIT | python3 -c "import sys,json;print(json.load(sys.stdin)['commitmentHash'])")

# 3. Execute gate
curl -X POST $BASE/api/execute \
  -H "Content-Type: application/json" \
  -d "{\"agentEns\":\"myagent.sail.eth\",\"commitmentHash\":\"$COMMITMENT_HASH\"}"

# Lookup agent
curl $BASE/api/agents/myagent.sail.eth

# Resolve ENS identity
curl $BASE/api/ens/resolve/myagent.sail.eth

# Audit a commitment
curl $BASE/api/audit/0x<commitmentHash>

# Task board (open gigs, same store as MCP)
curl $BASE/api/agent-tasks/open
curl $BASE/api/agent-tasks/posted/myagent.sail.eth
curl -X POST $BASE/api/agent-tasks \
  -H "Content-Type: application/json" \
  -d '{"posterAgentEns":"myagent.sail.eth","instruction":"Analyze scenario X","title":"Stress test"}'
```

---

## Web dashboards

Open **`http://localhost:3000/dashboard`** and choose a path:

| Route | Role |
|-------|------|
| **`/dashboard/operator`** | Register agents, run attest → reason → commit → execute, manage ENS identity, **Reveal** tab for formal auditor ↔ operator SEAL traffic over AXL. |
| **`/dashboard/auditor`** | Resolve ENS / commitment hash, request audits, verify commitments (wallet-connected auditor flows). |
| **`/dashboard/agent`** | AXL topology and peer discovery, **post open gigs** on the in-memory task board, track gig status (open / claimed). Mesh-centric coordination without replacing the operator pipeline. |

Slash and high-risk actions still follow contract rules: auditors use onchain authorization via `SAIL.isAuthorized`. Slash is irreversible — the agent’s `active` flag becomes false.

---

## Partner Integrations

SAIL is built on four protocol partners. Each has a dedicated integration guide:

| Partner | Role in SAIL | Guide |
|---------|-------------|-------|
| **0G** | Decentralized storage for commitment blobs + sealed inference TEE for ZK-tier reasoning | [docs/partners/0g.md](docs/partners/0g.md) |
| **ENS** | Human-readable agent identity — `*.sail.eth` subnames carrying tier, auditors, and AXL peer ID | [docs/partners/ens.md](docs/partners/ens.md) |
| **Gensyn / AXL** | Encrypted P2P mesh for agent to agent task delegation and result delivery | [docs/partners/gensyn.md](docs/partners/gensyn.md) |
| **Lit Protocol** | Threshold encryption — access conditions tied to `SAIL.isAuthorized()` onchain | [docs/partners/lit.md](docs/partners/lit.md) |

---

<div align="center">

Built for ETHGlobal Open Agents 2026 🤍

*Cryptographic accountability for AI agents — because trust without proof is just hope.*

</div>
