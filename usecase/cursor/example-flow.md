# SAIL in Cursor — example MCP flow

This doc walks through an attest inputs → commit on-chain → clear the execute gate. The same tools work against **local stdio** (`sail`) or **remote Streamable HTTP** (`sail-production`).

---

## 1. Prerequisites

- A **registered SAIL agent**, or register via MCP **`sail_register`** / **`POST /api/register`** (+ optional **`POST /api/ens/register`** for `*.sail.eth`). See **[registration.md](./registration.md)**.
- In Cursor: **MCP enabled** and the SAIL server shows **connected** (refresh MCP if you change config).

---

## 2. Cursor MCP config (reference)

Project file: [`.cursor/mcp.json`](../../.cursor/mcp.json).

- **`sail`** — runs `npm run mcp` in `backend/` with your `.env.local` (stdio).
- **`sail-production`** — points at your deployed Streamable HTTP URL, e.g. `https://<your-host>/mcp`.

For a **Bearer** token (if you set `MCP_HTTP_TOKEN` on the server), add:

```json
"headers": {
  "Authorization": "Bearer <MCP_HTTP_TOKEN>"
}
```

---

## 3. Example flow (happy path)

Use **Agent** (or chat with MCP tools) and steer the model to call tools **in order**. Below is a concrete scenario: *“Record a decision before acting.”*

### Step 0 — Register agent (only if not already on-chain)

**Tool:** `sail_register`

**Example arguments** (use real auditor addresses; often includes the operator address from `/health`):

```json
{
  "ens": "demo-judge.sail.eth",
  "tier": 0,
  "auditors": ["0x…"],
  "stakeEth": "0.01"
}
```

Create the **`*.sail.eth`** name first via the dashboard or **`POST /api/ens/register`** if needed. Skip this step if the agent already exists.

### Step A — Attest inputs (stage 01)

**Tool:** `sail_attest_inputs`

**Purpose:** Hash everything the agent saw **before** it reasons, so the commitment can bind to that snapshot.

**Example arguments:**

```json
{
  "inputs": {
    "task": "Demo: should we simulate a treasury rebalance for USDC?",
    "context": {
      "constraints": ["Sepolia demo only", "No real transfers"],
      "timestamp": "2026-05-02T12:00:00Z"
    }
  }
}
```

**Save from the response:** `inputHash` (hex string).

### Step B — Commit (stage 03)

**Tool:** `sail_commit`

**Purpose:** Encrypt blob → 0G Storage → anchor `commitmentHash` + `cid` on SAIL.

**Example arguments:**

```json
{
  "agentEns": "swarnim.sail.eth",
  "inputHash": "<paste inputHash from step A>",
  "decision": "Do not rebalance on mainnet; for demo, only document the intended allocation shift.",
  "proposedAction": "No on-chain txs; publish rationale to auditors via existing commitment only."
}
```

Optional: `attestation` if you ran 0G Compute sealed inference and want ZK-tier evidence in the blob.

**Save from the response:** `commitmentHash`, `cid`, `txHash` (Etherscan link in text).

### Step C — Execute gate (stage 04)

**Tool:** `sail_execute`

**Purpose:** Contract checks a prior commitment exists, then clears the gate so the “real” action is allowed by your process.

**Example arguments:**

```json
{
  "agentEns": "swarnim.sail.eth",
  "commitmentHash": "<paste commitmentHash from step B>"
}
```

**Save:** execute `txHash` / Etherscan link from the tool output.

---

## 4. Example natural-language prompt (paste into Cursor)

You can paste something like:

> Use the SAIL MCP tools. I am agent `swarnim.sail.eth`.  
> 1) Call `sail_attest_inputs` with this task and context: …  
> 2) Then call `sail_commit` with the returned `inputHash`, a short `decision`, and a concrete `proposedAction`.  
> 3) Then call `sail_execute` with the `commitmentHash` from commit.  
> Show each tool’s JSON result and the Etherscan links.

Adjust `agentEns` and copy real `inputHash` / `commitmentHash` between steps if the model does not chain them automatically.

---

## 5. Other tools (optional)

| Tool | When to use |
|------|-------------|
| `sail_discover` | Resolve ENS + capability / AXL records for another agent. |
| `sail_delegate` | Send a task over AXL to a worker (needs AXL up). |
| `sail_deliver` | Deliver tx bytes via AXL mesh (needs AXL up). |
| `sail_receive_messages` | Poll AXL inbox for replies. |

---

## 6. Operational notes

- **Hosted MCP** relies on **in-memory sessions**. If the Streamable HTTP connection drops after idle time, **toggle the MCP server off/on in Cursor** or retry; keeping **a single Railway replica** avoids session stickiness issues.
- **Local stdio** (`sail`) is the most stable option for long hacking sessions.
- If `sail_commit` fails, check RPC balance, 0G/Lit fallbacks, and that the ENS agent is **active** on the contract.

---
