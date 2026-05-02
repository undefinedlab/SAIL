# 🖥️ Frontend

> **Next.js 14 dashboard — Port 3000**

Two dashboards: an **Operator** workspace for running the SAIL pipeline, managing agents, and controlling the AXL mesh; and an **Auditor** workspace for verifying commitments and triggering slashes.

---

## Folder Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.js               # Root layout + providers
│   │   ├── page.js                 # Landing page
│   │   ├── wagmi.js                # Wagmi provider
│   │   └── dashboard/
│   │       ├── page.js             # Dashboard selector (Operator / Auditor)
│   │       ├── operator/page.js    # Operator workspace
│   │       └── auditor/page.js     # Auditor workspace
│   │
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── SailOperatorPanel.tsx   # Agent · Pipeline · Network tabs
│   │   │   ├── SailAuditorPanel.tsx    # Lookup · Audit · Slash
│   │   │   ├── ZeroGComputePanel.tsx   # 0G Compute provider + ledger panel
│   │   │   ├── IntegrationStatusCards.tsx  # Live status indicators
│   │   │   └── ConsoleFrame.tsx        # Terminal-style output frame
│   │   ├── hero/                   # Landing page hero
│   │   ├── landing/                # Landing page content
│   │   ├── providers/              # Wagmi + React providers
│   │   ├── ui/
│   │   │   ├── StatusDot.tsx       # Online/offline dot
│   │   │   └── TxLink.tsx          # Etherscan tx link
│   │   └── wallet/                 # Wallet connect button
│   │
│   └── lib/
│       ├── sail-api.ts             # All backend API calls (typed fetch wrappers)
│       ├── sail-abi.ts             # SAIL contract ABI + type helpers
│       ├── wagmi-config.ts         # Chain + transport config (Sepolia)
│       └── hooks/
│           └── useBackendStatus.ts # Polls /health every 5s
│
├── next.config.mjs                 # /api/* + /health proxy → backend
├── package.json
└── .env                            # Environment variables
```

---

## Pages

### `/dashboard/operator` — Three workspaces

| Tab | Sub-tabs | What you can do |
|-----|----------|-----------------|
| **Agent** | Register · Monitor | Register agent on SAIL + ENS. Look up stake, tier, commitment count. |
| **Pipeline** | — | Full SAIL pipeline: attest → 0G Compute reason → Lit encrypt → 0G upload → SAIL anchor → execute gate. |
| **Network** | Identity · Mesh | ENS subname management, AXL peer ID. Send/receive AXL messages, discover agents, delegate tasks, poll results. |

### `/dashboard/auditor` — Three actions

| Action | Description |
|--------|-------------|
| **Lookup** | Resolve ENS → stake, tier, auditors, commitment count, slash count |
| **Audit** | Commitment hash → fetch blob from 0G → verify keccak vs on-chain anchor → view decision |
| **Slash** | Call `SAIL.slash(ens)` → stake slashed to auditor |

---

## Setup

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

### Environment Variables

```env
NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS=0xaA99758ccD80E8CA9b2142950B04702ff9633990
NEXT_PUBLIC_ENS_PARENT_NAME=sail.eth
NEXT_PUBLIC_LIT_NETWORK=datil-test
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Points to local backend (change for production)
SAIL_API_PROXY_TARGET=http://localhost:3001
```

### API Proxy

`next.config.mjs` rewrites `/api/*` and `/health` to the backend:

```js
const target = process.env.SAIL_API_PROXY_TARGET ?? "http://localhost:3001";
// /api/:path* → target/api/:path*
```

---

## Wallet Integration

- **wagmi v2** + **viem** on Ethereum Sepolia (chain ID `11155111`)
- MetaMask, WalletConnect, Coinbase Wallet
- Only the Auditor slash is an on-chain tx from the frontend — all pipeline calls go through the backend operator wallet

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 14** | App Router, SSR, API proxy rewrites |
| **wagmi v2** | Wallet connection + chain management |
| **viem** | Type-safe Ethereum interactions |
| **TypeScript** | Type-safe implementation |
