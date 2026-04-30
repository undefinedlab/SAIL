# SAIL — Updated Architecture
## Secure Agentic Intelligence Layer

*Cryptographic accountability infrastructure for AI agents operating on-chain.*

**Hackathon:** ETHGlobal Open Agents 2026
**Partner prizes targeted:** 0G · ENS · AXL (Gensyn)
**Stack:** EVM (Base) · 0G Storage · 0G Compute · Lit Protocol · ENS · AXL · MCP

---

## What SAIL Is

SAIL is a commit-before-execute enforcement layer for AI agents. For any action an agent takes that requires verifiability a treasury transfer, a DAO vote execution, a regulated trade, an agent-to-agent payment — SAIL produces an on-chain receipt that cryptographically binds:

- **What the agent received** — the exact inputs before reasoning began
- **What the agent committed to** — the decision and proposed action, locked before execution
- **What the agent executed** — the action taken, bound to the same commitment

These three are linked on-chain. Any authorized party can verify the full chain at any time. The agent is a black box. SAIL makes that black box auditable.

---

## The Problem

AI agents managing on-chain value currently offer no mechanism to verify any part of their execution. There is no standard way to prove:

- What data an agent received before deciding
- What it committed to before acting
- Whether its action matched that commitment
- Whether the transaction it submitted arrived unmodified

Existing approaches place enforcement logic inside the operator's process — where the operator can modify it. A trust mechanism that trusts the entity it is designed to hold accountable is not a trust mechanism. Enforcement must happen at the contract level, not the application level.

---

## What Changed from v1

| Decision | v1 | Updated |
|---|---|---|
| Blob storage | Filecoin / Storacha | **0G Storage (KV + Log)** |
| Key management | Lit Protocol | **Lit Protocol — kept** |
| Verifiable inference | Not addressed | **0G Compute sealed inference for ZK tier** |
| Partner prizes | ENS · AXL · KeeperHub | **0G · ENS · AXL** |

**Why replace Filecoin with 0G Storage:** 0G Storage is a better architectural fit. Filecoin is built for large long-lived blobs. 0G Storage's KV mode gives real-time commitment state lookup and Log mode gives an append-only tamper-evident audit trail — exactly what SAIL needs. Switching also opens the $15k 0G prize, the largest in the hackathon.

**Why keep Lit Protocol:** Lit's threshold key custody is the reason no single party — not the operator, not SAIL's team — can unilaterally decrypt a commitment blob. Access conditions are tied directly to the SAIL contract: Lit nodes query `isAuthorized(auditorAddress)` before releasing the decryption key. This is what makes the audit flow trustless. Without Lit, key management falls back to the operator or SAIL infrastructure — neither of which can be trusted for the accountability guarantees SAIL makes.

**Why drop KeeperHub:** The integration story ("SAIL is an MCP server, KeeperHub picks it up natively") is thin for a prize track that wants depth. 0G at $15k is a strictly better use of the same build effort.

---

## Why MCP is the Distribution Mechanism

Every previous attempt at agent accountability required developers to change how they write agents: import our SDK, wrap your agent class, intercept your LLM calls, modify your business logic. The integration tax is high enough that adoption never happens outside forced compliance.

MCP is the standard protocol for LLM tool use. Every major agent framework already speaks it. SAIL exposes itself as an MCP server. The agent discovers SAIL tools the same way it discovers any other tool. The LLM calls `sail_commit` the same way it calls `get_price`.

**One MCP server. Every compatible framework. Zero integration work per framework.**

No wrappers. No interception. No changes to business logic. MCP is not a convenience — it is the only viable distribution path for an accountability layer.

---

## Updated Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  AGENT LAYER                                                     │
│  Any MCP-compatible framework                                    │
│  CrewAI · LangChain · ElizaOS · OpenClaw · custom               │
│  Agent calls SAIL tools natively during its reasoning turn      │
└──────────────────────────┬───────────────────────────────────────┘
                           │ MCP tool calls
                           │ sail_attest_inputs()
                           │ sail_commit()
                           │ sail_execute()
                           │ sail_deliver()
                           │ sail_discover()
                           │ sail_delegate()
┌──────────────────────────▼───────────────────────────────────────┐
│  SAIL MCP SERVER                                                 │
│  Node.js · exposes SAIL tools to any MCP-compatible framework   │
│  Routes commit blobs to Lit for encryption                      │
│  No enforcement logic here — enforcement is at the contract     │
└───────────────┬──────────────────────────┬───────────────────────┘
                │ plaintext blob            │ commitment_hash + nonce
┌───────────────▼──────────────┐ ┌──────────▼──────────────────────┐
│  LIT PROTOCOL                │ │  SAIL CONTRACT · EVM (Base)     │
│  Threshold key management    │ │                                 │
│  Encrypts blob · key shares  │ │  Commit-before-execute gate     │
│  distributed across nodes    │ │  Agent registry + stake ledger  │
│  Access condition:           │ │  Slash conditions               │
│  isAuthorized() on SAIL      │ │  Auditor authorization list     │
│  contract before decrypt     │ │  Tier enforcement               │
└───────────────┬──────────────┘ └─────────────────────────────────┘
                │ encrypted blob
┌───────────────▼──────────────┐
│  0G STORAGE                  │
│                              │
│  KV  → active commit state   │
│        fast lookup at exec   │
│                              │
│  Log → permanent audit trail │
│        append-only           │
│        CID anchored on-chain │
└───────────────┬──────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│  0G COMPUTE  (ZK tier only)                                      │
│  Sealed inference — verifiable LLM reasoning                    │
│  Attestation proves: which model · which inputs · which output  │
│  Closes the reasoning black-box for regulated use cases         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  ENS  ·  sail.eth namespace                                      │
│  Agent identity · capability registry · auditor addresses       │
│  AXL peer IDs · trust tier · one resolution returns everything  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  AXL MESH  ·  Gensyn                                            │
│  Encrypted peer-to-peer agent communication                     │
│  Task delegation · result delivery · tx submission              │
│  No centralized relayer · separate nodes per agent              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Role | Why this one |
|---|---|---|
| **SAIL Contract** | Commit gate + registry + slash enforcer | EVM-level enforcement cannot be bypassed at the application layer. The only immutable source of truth. |
| **MCP Server** | Tool interface for every agent framework | One server makes SAIL available to every MCP-compatible framework with zero per-framework integration work. |
| **Lit Protocol** | Threshold key management + access control | No single party holds the decryption key. Access conditions are tied to the SAIL contract — Lit nodes call `isAuthorized()` before releasing the key to any auditor. |
| **0G Storage KV** | Active commitment state | Fast real-time lookups: "does commitment X exist, is stake active?" Used by the execute gate on every action. |
| **0G Storage Log** | Permanent audit trail | Append-only, tamper-evident. Full history of every commitment and action per agent. CID on-chain is the integrity proof. |
| **0G Compute** | Verifiable inference for ZK tier | Sealed inference proves which model ran on which inputs. Closes the reasoning black-box problem for regulated use cases. |
| **ENS** | Agent identity + directory | One resolution returns: AXL peer ID, tier, capabilities, auditors, stake status. No backend directory needed. |
| **AXL** | Agent-to-agent communication | Encrypted P2P mesh. Task delegation, result delivery, tx submission — no central relay, no SAIL-controlled intermediary. |

---

## The Pipeline

Every `sail_commit()` → `sail_execute()` sequence enforces six stages at the contract level. The pipeline is not advisory. Skipping any stage causes execution to revert.

```
01  ATTEST INPUTS
    input_hash = SHA256(all_inputs)
    Hashed before reasoning begins.
    Proves exactly what the agent received.

02  REASON
    Agent reasons using any LLM, any framework.
    SAIL does not observe or constrain this stage.
    ZK tier: reasoning routed through 0G Compute sealed inference.
    Optimistic tier: black box, audit-on-request only.

03  COMMIT
    Commitment blob: { input_hash, decision, proposed_action, timestamp, agent_ens }
    → MCP server sends plaintext blob to Lit Protocol
    → Lit encrypts blob · key shares distributed across Lit nodes
    → Access condition set: isAuthorized(auditorAddress) on SAIL contract
    → Encrypted blob written to 0G Storage Log → returns CID
    → commitment_hash + CID + nonce posted to SAIL contract on-chain
    Agent cannot call sail_execute() until on-chain confirmation received.

04  EXECUTE
    SAIL contract checks:
      ✓  commitment_hash exists on-chain
      ✓  nonce confirms commitment precedes this execution
      ✓  agent stake is active
      ✓  tier satisfies minimum requirement for this action value
    ALL PASS → execution proceeds
    ANY FAIL → reverts. No bypass.

05  DELIVER
    Transaction bytes committed on-chain before submission.
    Transaction submitted via AXL encrypted mesh.
    Any modification in transit is detectable against committed hash.

06  AUDIT (on request)
    Authorized auditor requests decrypt for a CID from Lit Protocol.
    Lit nodes query SAIL contract: isAuthorized(auditorAddress, agentENS)?
    Threshold of Lit nodes agree → blob decrypted and returned.
    Auditor fetches encrypted blob from 0G Storage by CID.
    Auditor computes SHA256(plaintext) vs on-chain commitment_hash.
    MATCH   → chain is consistent. Input-commit-execute proven intact.
    MISMATCH → auditor calls sail_contract.slash(agentENS).
```

---

## 0G Storage: KV vs Log

```
0G Storage KV
  Purpose:    real-time active commitment state
  Contains:   { agentENS → latest_commitment_hash, stake_status, last_nonce }
  Used by:    execute gate — fast lookup per action
  Write:      updated on each new commit

0G Storage Log
  Purpose:    permanent append-only audit trail
  Contains:   [ commitment_hash · CID · action_hash · timestamp ] per action
  Used by:    audit flow — full history, retrievable by CID
  Write:      append-only, no overwrites possible
```

The CID returned by 0G Storage Log is the integrity proof. If anyone modifies a stored blob, the CID changes and no longer matches the on-chain anchor. Tampering is immediately detectable without any additional verification step.

---

## ENS: More Than a Name

`myagent.sail.eth` is the operational entry point for the entire protocol. Every agent interaction begins with one ENS resolution:

```
treasury-agent.sail.eth
├── addr              → 0xAgentWallet
├── axl_peer_id       → 12D3KooW...   (how to reach on AXL mesh)
├── tier              → optimistic | zk | tee
├── capabilities      → treasury, trading
├── auditors          → 0xRegulator, 0xDAOMultisig
└── stake_status      → active (resolved from SAIL contract)
```

Remove ENS and the protocol has no agent directory, no discoverability, no human-readable identity, no capability advertising, and no routing to AXL. ENS is the phonebook the entire system is built on.

---

## AXL: Why No Central Relay

AXL is an encrypted P2P mesh. Agents find each other via ENS (which returns the AXL peer ID), then communicate directly. No SAIL-controlled server sits in the middle.

SAIL uses AXL for:

- **Task delegation** — hiring agent sends task payload to worker agent directly
- **Result delivery** — worker returns result + commitment_hash to hiring agent
- **Transaction delivery** — tx bytes submitted via AXL after being committed on-chain

Gensyn's hard qualification requirement: two genuinely separate AXL nodes (not in-process). SAIL satisfies this natively — hiring agents and worker agents run as separate nodes.

---

## Slash Condition

One condition. One outcome. No ambiguity.

```
SHA256(decrypted_blob) ≠ on-chain commitment_hash
→ sail_contract.slash(agentENS)
→ full stake slashed
→ registration suspended
→ permanent record on 0G Storage Log
```

An authorized auditor triggers this. Nobody else can. No dispute windows. No partial penalties. Immediate execution on proof of mismatch.

---

## Agent-to-Agent Flow

```
Hiring agent resolves worker.sail.eth via ENS
  → returns: AXL peer ID · tier · capabilities · stake status

Opens encrypted AXL channel to worker
  → sends: task payload

Worker runs full SAIL pipeline
  → attests inputs
  → reasons (+ 0G Compute attestation if ZK tier)
  → commits: encrypted blob to 0G Log · hash to SAIL contract
  → executes: contract-gated, reverts if no prior commitment
  → returns result + commitment_hash to hiring agent via AXL

Hiring agent verifies commitment exists on-chain
  → payment settles

On dispute:
  → hiring agent (listed as auditor at registration) requests reveal
  → blob decrypted, SHA256 verified against on-chain hash
  → mismatch → slash fires
```

---

## Trust Tiers

Declared at registration. Stored in ENS. Enforced by contract.

| Tier | Proof | Use case |
|---|---|---|
| **Optimistic** | Audit-on-request only | DAO governance · treasury · routine settlement |
| **ZK** | 0G Compute sealed inference attestation | Regulated actions · provable reasoning |
| **TEE** | Hardware attestation | High-frequency trading · maximum confidentiality |

The SAIL contract enforces minimum tier requirements for actions above defined value thresholds. An Optimistic-tier agent cannot execute actions that require ZK tier.

**ZK tier and 0G Compute:** For Optimistic tier, reasoning is a black box — SAIL proves execution consistency only. For ZK tier, reasoning is routed through 0G Compute's sealed inference endpoint. The attestation proves: which model ran, on which inputs, and what output it produced. Reasoning integrity is provable, not just execution consistency.

---

## MCP Tools Reference

| Tool | Pipeline stage | What it does |
|---|---|---|
| `sail_attest_inputs(data)` | Stage 1 | SHA256(inputs), returns attestation bundle |
| `sail_commit(decision, action)` | Stage 3 | Sends blob to Lit for encryption, writes to 0G Log, posts hash+CID on-chain |
| `sail_execute(commitment_hash, calldata)` | Stage 4 | Contract-gated — reverts if no prior commitment |
| `sail_deliver(tx_bytes)` | Stage 5 | Commits tx hash on-chain, submits via AXL |
| `sail_discover(capability)` | Discovery | Finds agents by capability via ENS subgraph |
| `sail_delegate(ens, task)` | Delegation | Opens AXL channel to worker, sends task |

---

## Framework Integration

```bash
# Step 1 — register and start the MCP server
docker run sail/mcp-server \
  --ens="myagent.sail.eth" \
  --stake=0.1 \
  --tier=optimistic \
  --capabilities=treasury,trading \
  --auditors=0xRegulator,0xDAOMultisig
```

On startup: agent registered in SAIL contract, ENS subdomain minted, stake locked, AXL peer ID announced to ENS, 0G Storage KV entry initialized.

```python
# Step 2 — point any MCP-compatible framework at the server
from crewai import Agent
from mcp import MCPClient

sail = MCPClient("http://localhost:8745")

agent = Agent(
    role="Treasury Analyst",
    llm="claude-sonnet-4-6",
    tools=sail.get_tools()
)
```

The LLM calls SAIL tools as part of its natural reasoning turn. No wrappers. No interception. No changes to business logic. Same server works for LangChain, ElizaOS, OpenClaw without modification.

---

## Partner Prize Integration Rationale

### 0G — $15,000

0G is the storage and compute backbone of the protocol.

**0G Storage** is the audit trail. KV layer holds real-time commitment state for execute gate checks. Log layer is the permanent append-only record of every commitment ever made. Without 0G Storage, SAIL has no audit trail and no execution gate state. This is a load-bearing integration, not a feature addition.

**0G Compute** enables the ZK trust tier. Sealed inference produces an attestation proving which model ran on which inputs and what it output. This directly closes the core limitation of any commitment-based system: you can prove what was committed but not that the reasoning was honest. 0G Compute makes reasoning verifiable for the first time.

Targets both 0G tracks: SAIL as framework-level tooling (Best Agent Framework) and the demo agent as an autonomous agent built on 0G (Best Autonomous Agents).

### ENS — $5,000

Every agent interaction in SAIL begins with an ENS resolution. The resolved record returns AXL peer ID, trust tier, capabilities, auditor addresses, and stake status. Remove ENS and the protocol has no agent discovery, no routing, no trust signaling, and no human-readable identity. ENS is load-bearing, not cosmetic.

Targets: Best ENS Integration for AI Agents.

### AXL (Gensyn) — $5,000

All agent communication in SAIL routes over AXL. Task payloads, results, commitment hashes, and transaction bytes travel over encrypted P2P mesh with no SAIL-controlled relay. Two separate AXL nodes are required by Gensyn's qualification criteria — satisfied natively by the hiring/worker agent architecture.

Targets: Best Application of AXL.

---

## What SAIL Proves

SAIL proves that the input received, the commitment made, and the action executed are consistent and tamper-evident — verifiable by any authorized party at any time against the permanent on-chain record and 0G Storage audit trail.

For ZK tier agents using 0G Compute: SAIL additionally proves that a specific model produced a specific output from the attested inputs. Reasoning integrity is provable, not just execution consistency.

## What SAIL Does Not Prove

For Optimistic tier agents: SAIL does not prove that the agent's reasoning was sound or that the LLM output was correct. The agent is a black box. SAIL makes the shell around that black box cryptographically accountable. Execution consistency is the guarantee. ZK tier with 0G Compute addresses reasoning integrity for use cases that require it.

---

## Stack Summary

| Component | Technology |
|---|---|
| Smart contract | Solidity · Base (EVM) |
| MCP server | Node.js · MCP protocol |
| Key management + access control | Lit Protocol |
| Commitment storage | 0G Storage (KV + Log) |
| Verifiable inference | 0G Compute (ZK tier) |
| Agent identity | ENS · sail.eth namespace |
| Agent communication | AXL encrypted mesh |
| Framework support | CrewAI · LangChain · ElizaOS · OpenClaw |
