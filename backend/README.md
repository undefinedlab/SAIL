# 🔧 Backend

> **TypeScript/Express API server — Port 3001**

The SAIL backend is the central orchestration layer. It bridges the frontend dashboards and MCP clients with the SAIL smart contract, 0G Storage, 0G Compute, Lit Protocol, ENS, and the Gensyn AXL P2P mesh. Every request flows through here — pipeline stages, agent registration, auditing, and cross-agent delegation.

---

## Architecture

```
Frontend (Next.js)          MCP Clients (Claude, Cursor, LangChain…)
    /api/* proxy                 stdio / Streamable HTTP /mcp
         │                                │
         ▼                                ▼
┌─────────────────────────────────────────────────────┐
│           Express API  localhost:3001                │
│                                                     │
│  src/api/routes.ts         SAIL pipeline REST API   │
│  src/api/ens-routes.ts     ENS subname CRUD         │
│  src/api/axl-routes.ts     AXL mesh + delegation    │
│  src/mcp/server.ts         8 MCP tool definitions   │
│  src/mcp/http-server.ts    Streamable HTTP /mcp      │
└──────┬──────────────┬──────────────────┬────────────┘
       │              │                  │
       ▼              ▼                  ▼
  Ethereum       0G Galileo          AXL Node
  Sepolia        Testnet             localhost:9002
  (SAIL          (Storage +          (Gensyn P2P
  contract)       Compute)            mesh)
       │
       ▼
  ENS (Sepolia)
  sail.eth / *.sail.eth
```

---

## Folder Structure

```
backend/
│
├── src/                        # TypeScript source
│   ├── index.ts                #   Express entry point — boot, AXL start, MCP mount
│   ├── api/
│   │   ├── routes.ts           #   SAIL pipeline: /api/attest, /commit, /execute, /audit
│   │   ├── pipeline.ts         #   Stage orchestrator — attest, reason, commit, execute
│   │   ├── ens-routes.ts       #   /api/ens/register, /resolve, /owns, /config
│   │   ├── axl-routes.ts       #   /api/axl/status, /send, /recv, /delegate, /topology
│   │   ├── mcp-invoke-routes.ts#   MCP tool invocation via REST
│   │   └── register-agent-shared.ts  # Shared ENS subname creation logic
│   ├── contract/
│   │   └── sail.ts             #   SAIL contract bindings (ethers.js)
│   ├── config/
│   │   └── env.ts              #   All env var parsing + defaults
│   ├── lit/
│   │   ├── encrypt.ts          #   Lit Chipotle encrypt/decrypt + AES-256-GCM fallback
│   │   └── README.md           #   Lit Protocol integration guide
│   ├── mcp/
│   │   ├── server.ts           #   8 MCP tool definitions
│   │   ├── tool-runners.ts     #   Tool execution logic
│   │   ├── http-server.ts      #   Streamable HTTP MCP transport at /mcp
│   │   ├── mcp-auth.ts         #   MCP bearer token auth
│   │   └── index.ts            #   stdio MCP entry point (npm run mcp)
│   └── scripts/
│       ├── smoke.ts            #   End-to-end smoke test (full pipeline)
│       ├── setup-compute.ts    #   0G Compute ledger setup
│       ├── setup-lit.ts        #   Lit Chipotle PKP + API key creation
│       ├── register-ens-agent.ts   # CLI: register ENS subname
│       ├── audit-commitment.ts     # CLI: audit a commitment hash
│       ├── decrypt-commitment-auditor.ts  # CLI: auditor decrypt
│       ├── test-pipeline-agent.ts  # CLI: run pipeline as agent
│       └── reachability.ts     #   Check all external services
│
├── 0g/
│   ├── storage.ts              #   0G Storage upload/download (Galileo, Log mode)
│   ├── compute.ts              #   0G Compute broker, ledger, sealed inference
│   └── README.md               #   0G integration guide
│
├── ens/
│   ├── registry.ts             #   ENS adapter — NameWrapper-aware subname registration
│   └── README.md               #   ENS integration guide
│
├── gensyn/
│   ├── node.ts                 #   AXL binary: clone gensyn-ai/axl, go build, spawn
│   ├── client.ts               #   AXL HTTP bridge client (topology, send, recv)
│   ├── task-router.ts          #   Worker delegation loop (sail.task → sail.result)
│   ├── mock-bridge.ts          #   Local mock for testing without AXL node
│   └── README.md               #   Gensyn/AXL integration guide
│
├── .axl/                       #   Auto-generated on first boot (git-ignored)
│   ├── node-config.json        #   AXL node config (ports, key path, peers)
│   ├── private.pem             #   ed25519 identity key (unique per developer)
│   └── repo/                   #   gensyn-ai/axl cloned here + Go binary built
│
├── package.json
├── tsconfig.json
├── railway.toml                #   Railway deployment config
└── .env                        #   Environment variables (git-ignored)
```

---

## API Reference

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Backend status, contract address, AXL status, MCP path |

### SAIL Pipeline
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/register` | Register agent on SAIL contract + ENS subname |
| `POST` | `/api/attest` | Stage 01 — SHA256 hash of all inputs |
| `POST` | `/api/reason` | Stage 02 — 0G Compute sealed inference |
| `POST` | `/api/commit` | Stage 03 — Lit encrypt + 0G upload + SAIL anchor |
| `POST` | `/api/execute` | Stage 04 — Clear execute gate |
| `GET` | `/api/audit/:hash` | Stage 06 — Fetch + decrypt commitment for auditor |
| `GET` | `/api/reveal/:cid` | Download encrypted blob from 0G by CID |
| `GET` | `/api/agents/:ens` | Read agent state from SAIL contract |
| `GET` | `/api/commitments/:hash` | Read commitment record from SAIL contract |

### 0G Compute
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/compute/providers` | List all live inference providers |
| `GET` | `/api/compute/ledger` | Get ledger balance |
| `POST` | `/api/compute/ledger/setup` | Create ledger + deposit OG tokens |
| `POST` | `/api/compute/ledger/deposit` | Top up existing ledger |
| `GET` | `/api/compute/ledger/providers` | List providers with funded sub-accounts |

### ENS
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/ens/config` | Parent name + operator address |
| `GET` | `/api/ens/owns/:name` | Check operator wallet owns name |
| `GET` | `/api/ens/resolve/:name` | Read SAIL text records |
| `POST` | `/api/ens/register` | Create wrapped subname + write records |

### AXL Mesh
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/axl/status` | Node health, peer ID, IPv6, peers |
| `GET` | `/api/axl/topology` | Full spanning tree topology |
| `POST` | `/api/axl/send` | Send message to a peer |
| `GET` | `/api/axl/recv` | Poll inbox |
| `GET` | `/api/axl/discover/:ens` | Resolve ENS → AXL peer ID + capabilities |
| `POST` | `/api/axl/delegate` | Delegate task to worker agent |
| `GET` | `/api/axl/delegations` | List outbound delegations |
| `GET` | `/api/axl/delegations/:id` | Poll delegation status |
| `GET` | `/api/axl/tasks` | Tasks processed by this node (worker side) |
| `POST` | `/api/axl/router/start` | Start task router background poller |
| `POST` | `/api/axl/router/stop` | Stop task router |

### MCP
| Transport | Path | Usage |
|-----------|------|-------|
| stdio | `npm run mcp` | Claude Code, Cursor local |
| Streamable HTTP | `/mcp` | Cursor remote, LangChain, any HTTP client |

---

## MCP Tools

| Tool | Stage | What it does |
|------|-------|--------------|
| `sail_register` | Setup | Register agent on-chain (stake + tier + auditors + ENS) |
| `sail_attest_inputs` | 01 | Hash all agent inputs before reasoning |
| `sail_commit` | 03 | Encrypt decision + upload to 0G + anchor on SAIL |
| `sail_execute` | 04 | Clear the execute gate |
| `sail_deliver` | 05 | Send result via AXL P2P mesh |
| `sail_discover` | Discovery | Resolve ENS → capabilities + AXL peer ID |
| `sail_delegate` | Delegation | Send task to worker agent via AXL |
| `sail_receive_messages` | Inbox | Poll AXL inbox |

---

## Setup

### Prerequisites

- **Node.js 22+**
- **Go 1.21+** — for AXL binary (`brew install go`)
- **OpenSSL** — for AXL key generation (pre-installed on macOS/Linux)

### Install

```bash
cd backend
npm install
cp .env.example .env   # fill in your keys
npm run dev
```

### Environment Variables

```env
# SAIL Contract
SAIL_CONTRACT_ADDRESS=0xaA99758ccD80E8CA9b2142950B04702ff9633990
SAIL_CHAIN_ID=11155111
ETH_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
OPERATOR_PRIVATE_KEY=0x...

# 0G Storage + Compute
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZERO_G_PRIVATE_KEY=0x...
ZERO_G_COMPUTE_PROVIDER=0xa48f01287233509FD694a22Bf840225062E67836

# Lit Protocol Chipotle
LIT_CHIPOTLE_API_KEY=...
LIT_CHIPOTLE_PKP_ID=...
LIT_NETWORK=datil-test

# ENS
ENS_PARENT_NAME=sail.eth

# AXL / Gensyn
AXL_AUTO_START=true
AXL_BRIDGE_URL=http://localhost:9002
AXL_TCP_PORT=7000
```

### NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start backend with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript → dist/ |
| `npm start` | Run compiled JS (production) |
| `npm run mcp` | Start stdio MCP server |
| `npm run smoke` | Run end-to-end smoke test |
| `npm run setup-compute` | Fund 0G Compute ledger |
| `npm run setup-lit` | Create Chipotle PKP + API key |

---

## Partner Integration Guides

| Partner | Guide |
|---------|-------|
| 0G Storage + Compute | [0g/README.md](0g/README.md) |
| Gensyn / AXL | [gensyn/README.md](gensyn/README.md) |
| ENS | [ens/README.md](ens/README.md) |
| Lit Protocol | [src/lit/README.md](src/lit/README.md) |
