# 🔵 ENS — Agent Identity Integration

> **ENS Partner Prize Submission**

SAIL uses **ENS** as the canonical identity layer for every AI agent. An ENS subname is not just a human-readable address — it is a machine-readable capability manifest. When an agent looks up `worker.sail.eth`, it gets the agent's trust tier, auditors, SAIL contract address, and AXL peer ID to message it directly.

---

## Why We Need ENS

AI agents need identities that other agents, auditors, and infrastructure can discover without a central server.

Without ENS, SAIL would need its own offchain registry — a centralized point of failure. Every agent would need a raw wallet address (e.g. `0xc5b7...`) to be known, shared, and stored somewhere that anyone wanting to interact with that agent could look up. That lookup breaks the moment the registry goes down.

With ENS, the identity is **onchain and self-describing**:
- `swarnim.sail.eth` is human-readable and resolvable by anyone
- The text records stored on the ENS public resolver act as a **machine-readable capability manifest** — no separate API needed
- Lit Protocol reads `SAIL.isAuthorized()` before decryption using the auditor address from the agent's onchain SAIL record; ENS surfaces that address to any caller
- AXL uses the `axl_peer_id` text record to know which P2P address to send a task to — no address book required
- ENS subnames are **non-custodial** — the operator wallet owns them, not SAIL

Without ENS, multiagent delegation would require exchanging wallet addresses and peer IDs out of band. With ENS, `sail_delegate("worker.sail.eth", task)` is the entire handshake.

### How ENS Tech Stack Helps SAIL

| ENS Primitive | How SAIL Uses It |
|---------------|------------------|
| **Subdomains** (`*.sail.eth`) | Each agent gets its own `name.sail.eth` — created in one backend call, owned by the agent operator |
| **Text records** | Store `sail_tier`, `sail_contract`, `capabilities`, `auditors`, `axl_peer_id` — all readable by any agent or auditor |
| **Public Resolver** | `setText` / `text` — standard resolver works without custom contracts |
| **NameWrapper** | Parent `sail.eth` is wrapped — SAIL inherits the expiry so subnames appear in the ENS app with the Manager badge |
| **`namehash` / `normalize`** | Canonical ENS name normalization via viem — prevents homoglyph attacks |

---

## What We Built

Every SAIL agent gets a **subdomain under `sail.eth`** on Ethereum Sepolia. Registration happens in one call from the frontend dashboard or the `sail_register` MCP tool. The ENS name carries structured text records that form the agent's public identity:

```
swarnim.sail.eth
  → sail_tier        = optimistic
  → sail_contract    = 0xaA99758ccD80E8CA9b2142950B04702ff9633990
  → capabilities     = commit,execute,audit,delegate
  → auditors         = 0xc5b7b574EE84A9B59B475FE32Eaf908C246d3859
  → axl_peer_id      = 699a15da...041d84
```

Any other agent or auditor can resolve this name to get the full picture. No centralized registry. No API key. Just ENS.

---

## Architecture

### Source Files

| File | Purpose |
|------|---------|
| `backend/ens/registry.ts` | Full ENS adapter — register subnames, read/write text records, NameWrapper-aware |
| `backend/src/api/ens-routes.ts` | REST endpoints — config, owns, resolve, register |

### NameWrapper-Aware Registration

Modern ENS names (including `sail.eth`) are **wrapped in the NameWrapper contract**. SAIL handles both wrapped and legacy names automatically:

```typescript
if (isWrapped) {
  // Inherit parent expiry → subname appears in ENS app with Manager badge
  const [, , parentExpiry] = await nameWrapper.getData(BigInt(parentNode));
  await nameWrapper.setSubnodeRecord(
    parentNode, subLabel, owner, PUBLIC_RESOLVER, 0n, 0, parentExpiry
  );
} else {
  await registry.setSubnodeRecord(parentNode, labelHash(subLabel), owner, PUBLIC_RESOLVER, 0n);
}
```

---

## ENS Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| **ENS Registry** | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| **Public Resolver** | `0x8FADE66B79cC9f707aB26799354482EB93a5B7dD` |
| **NameWrapper** | `0x0635513f179D50A207757E05759CbD106d7dFcE8` |

---

## SAIL Text Records

| Record Key | Example Value | Description |
|------------|---------------|-------------|
| `sail_tier` | `optimistic` \| `zk` \| `tee` | Agent trust tier |
| `sail_contract` | `0xaA99758...` | SAIL contract address |
| `capabilities` | `commit,execute,audit,delegate` | What this agent supports |
| `auditors` | `0xc5b7b574...` | Comma-separated authorized auditor addresses |
| `axl_peer_id` | `699a15da...041d84` | 64-char hex Gensyn AXL peer ID |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ens/config` | Parent ENS name + operator address |
| `GET` | `/api/ens/owns/:name` | Check if operator wallet owns the name |
| `GET` | `/api/ens/resolve/:name` | Read all SAIL text records for a name |
| `POST` | `/api/ens/register` | Create wrapped subname + write text records |

---

## API Usage

```bash
# Register an agent
curl -X POST http://localhost:3001/api/ens/register \
  -H "Content-Type: application/json" \
  -d '{
    "parentName": "sail.eth",
    "subLabel": "myagent",
    "records": {
      "sail_tier": "optimistic",
      "sail_contract": "0xaA99758ccD80E8CA9b2142950B04702ff9633990",
      "capabilities": "commit,execute",
      "auditors": "0xYourAuditorAddress"
    }
  }'
# { "ensName": "myagent.sail.eth", "txHashes": ["0x..."], "pendingRecords": true }

# Resolve an agent
curl http://localhost:3001/api/ens/resolve/swarnim.sail.eth
# { "ensName": "swarnim.sail.eth", "records": { "sail_tier": "optimistic", "axl_peer_id": "699a...", ... } }

# Check ownership
curl http://localhost:3001/api/ens/owns/sail.eth
# { "owns": true, "operator": "0xc5b7b574...", "name": "sail.eth" }
```

---

## Live Subnames

All subnames visible at [sepolia.app.ens.domains](https://sepolia.app.ens.domains) → search `sail.eth` → Subnames tab.

| ENS Name | Tier | AXL |
|----------|------|-----|
| `swarnim.sail.eth` | optimistic | configured |
| `0x17swarn.sail.eth` | zk | `699a15da...041d84` |
| `test-agent.sail.eth` | optimistic | — |

---

## Setup

```env
# ENS (add to backend/.env)
ENS_PARENT_NAME=sail.eth
OPERATOR_PRIVATE_KEY=0x...
ETH_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

The operator wallet must own the parent ENS name on Sepolia. Use your own parent name by changing `ENS_PARENT_NAME` — subnames become `agent.yourname.eth`.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| `viem` | ENS client — namehash, normalize, publicClient, walletClient |
| `viem/ens` | `normalize()` for ENS name normalization |
| NameWrapper ERC-1155 | Wrapped name ownership + subname creation with inherited expiry |
| Public Resolver | `setText`, `setAddr`, `text` record storage |
