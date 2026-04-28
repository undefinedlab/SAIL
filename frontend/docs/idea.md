# SAIL
## Secure Agentic Intelligence Layer

*Verifiable execution infrastructure for AI agents operating on-chain.*

**Stack:** EVM · Lit Protocol · Filecoin · ENS · AXL · x402 · MCP

---

## What We Build

SAIL is a cryptographic accountability layer for AI agents. For any action an agent takes that requires verifiability — a treasury transfer, a DAO vote execution, a regulated trade, a high-value agent-to-agent payment — SAIL produces an on-chain receipt that binds:

- **What the agent received** — the exact inputs it was given before deciding
- **What the agent committed to** — the decision and proposed action, locked before execution
- **What the agent executed** — the action taken, bound to the same commitment

These three are linked cryptographically, enforced at the contract level, and stored permanently in an encrypted audit trail. Any authorized party can verify the full chain on demand.

The agent is a black box. SAIL makes that black box auditable.

---

## The Problem

AI agents managing on-chain value currently offer no mechanism to verify any part of their execution. There is no standard way to prove what data an agent received, what it committed to before acting, whether it acted consistently with that commitment, or whether the transaction it submitted arrived unmodified.

Existing approaches place enforcement logic inside the operator's process — where the operator can modify it. A trust mechanism that trusts the entity it is designed to hold accountable is not a trust mechanism.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  AGENT                                                          │
│  Any framework · CrewAI · LangChain · ElizaOS · custom         │
│  Calls SAIL tools natively via MCP during reasoning            │
└─────────────────────────┬───────────────────────────────────────┘
                          │ MCP tools
                          │ sail_attest_inputs()
                          │ sail_commit()
                          │ sail_execute()
┌─────────────────────────▼───────────────────────────────────────┐
│  SAIL MCP SERVER                                                │
│  Exposes SAIL tools to any MCP-compatible agent framework      │
│  Runs as a separate process · no enforcement logic here        │
│  Routes commits to Lit · posts hashes on-chain                 │
└──────────┬──────────────────────────────┬───────────────────────┘
           │ encrypt + key management     │ commitment hash + nonce
┌──────────▼──────────────┐  ┌────────────▼──────────────────────┐
│  LIT PROTOCOL           │  │  SAIL CONTRACT · EVM (Base)       │
│  Threshold key mgmt     │  │  Commit-before-execute gate       │
│  Blob encryption        │  │  Agent registry · stake ledger    │
│  Access conditions      │  │  Slash conditions · x402 settle   │
│  tied to SAIL contract  │  │  Lit access condition authority   │
└──────────┬──────────────┘  └───────────────────────────────────┘
           │ encrypted blob
┌──────────▼──────────────────────────────────────────────────────┐
│  FILECOIN / STORACHA                                            │
│  Permanent encrypted blob storage · 30 days free               │
│  CID posted on-chain = tamper-evident integrity proof          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ENS (sail.eth) · AXL MESH                                     │
│  Agent identity · capability registry · auditor addresses      │
│  Encrypted p2p agent comms · tx delivery · no relayer          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Role | Why this one |
|---|---|---|
| **MCP Server** | Tool interface for any agent framework | Any MCP-compatible agent calls SAIL tools natively. No wrappers. No interception. One server, any framework. |
| **Lit Protocol** | Encryption key management + access control | Threshold key custody, no single custodian. Access conditions tied directly to the SAIL contract. Existing production infrastructure. |
| **SAIL Contract** | Commit-before-execute enforcement + registry | EVM-level enforcement cannot be bypassed at the application layer. Immutable source of truth for registry, stake, and Lit access conditions. |
| **Filecoin** | Permanent encrypted blob storage | Content-addressed, operator-independent, tamper-evident. CID is the integrity proof. |
| **ENS** | Agent identity + metadata | Human-readable names, capability advertisement, auditor addresses, AXL peer IDs — all in one resolution. |
| **AXL** | Agent-to-agent communication + tx delivery | Encrypted peer-to-peer mesh. No centralized relayer. Task delegation and transaction delivery without a third party. |
| **x402** | Payment conditioned on commitment | Payment releases only when the SAIL contract confirms a valid commitment exists for the task. |

---

## The Pipeline

Every `sail_commit()` → `sail_execute()` sequence enforces six stages at the contract level. The pipeline is not advisory. Skipping any stage causes execution to revert.

```
01  ATTEST INPUTS
    input_hash = SHA256(all_inputs)
    Hashed before reasoning begins.
    Locked into the commitment. Proves exactly what the agent received.

02  REASON
    Agent reasons using any LLM, any framework.
    SAIL does not observe or constrain this stage.

03  COMMIT
    Commitment blob: { input_hash, decision, proposed_action, timestamp }
    → Lit Protocol encrypts blob, manages decryption key
    → Encrypted blob pinned to Filecoin → CID
    → Commitment hash + CID + nonce posted on-chain by SAIL contract
    Agent cannot call sail_execute() until on-chain confirmation.

04  EXECUTE
    SAIL contract checks:
      ✓  commitment hash exists on-chain
      ✓  nonce confirms commitment precedes this execution
      ✓  agent stake is active
    ALL PASS → execution proceeds
    ANY FAIL → reverts. No bypass.

05  DELIVER
    Transaction submitted via AXL encrypted mesh.
    Transaction bytes committed on-chain before submission.
    Any substitution in transit is detectable against committed hash.

06  AUDIT (on request)
    Authorized party requests decrypt via Lit Protocol.
    Lit checks SAIL contract: isAuthorized(auditorAddress)?
    Threshold of Lit nodes agree → blob decrypted.
    SHA256(plaintext) verified against on-chain commitment_hash.
    Match   → chain is consistent. Input-commit-execute proven intact.
    Mismatch → full slash. Registration suspended.
```

---

## Slash Condition

One condition. One outcome. No ambiguity.

```
SHA256(decrypted_blob) ≠ on-chain commitment_hash
→ sail_contract.slash(agentENS)
→ full stake slashed
→ registration suspended
```

An authorized auditor triggers this. Nobody else can. No challenger marketplace. No dispute windows. No partial penalties. The contract executes the slash immediately on proof of mismatch.

---

## Integration

Any agent framework with MCP support connects in two steps.

**Step 1 — Register and start the MCP server**
```bash
docker run sail/mcp-server \
  --ens="myagent.sail.eth" \
  --stake=0.1 \
  --tier=optimistic \
  --capabilities=treasury,trading \
  --auditors=0xRegulator,0xDAOMultisig
```

On startup: agent registered in SAIL contract, ENS subdomain minted,
stake locked, Lit access conditions set, AXL peer ID announced.

**Step 2 — Point the agent framework at the MCP server**
```python
from crewai import Agent
from mcp import MCPClient

sail = MCPClient("http://localhost:8745")

agent = Agent(
    role="Treasury Analyst",
    llm="claude-sonnet-4",
    tools=sail.get_tools()
)
```

The LLM calls SAIL tools as part of its reasoning turn.
No wrappers. No interception. No changes to business logic.

**SAIL MCP Tools**

| Tool | What it does |
|---|---|
| `sail_attest_inputs(data)` | Hashes all inputs, returns attestation bundle |
| `sail_commit(decision, action)` | Encrypts via Lit, pins to Filecoin, posts on-chain |
| `sail_execute(commitment_hash, action)` | Contract-gated execution |
| `sail_deliver(tx_bytes)` | Submits via AXL with pre-committed tx hash |
| `sail_discover(capability)` | Finds agents by capability via ENS subgraph |
| `sail_delegate(ens, task)` | Opens AXL channel, sends task, pre-authorizes x402 |

---

## Public Registry

Every SAIL agent is visible on-chain. The contract is the registry. No backend.

```
myagent.sail.eth
├── status:            active
├── stake:             0.1 ETH (locked)
├── tier:              optimistic
├── capabilities:      treasury, trading
├── auditors:          0xRegulator, 0xDAOMultisig
├── total_committed:   247
├── audits:            3 requested · 3 consistent
├── slashes:           0
└── history:           [ commitment_hash · CID · action_hash ] × 247
```

---

## Trust Tiers

Declared at registration. Public in ENS.

| Tier | Proof | Use case |
|---|---|---|
| **Optimistic** | Audit-on-request | DAO governance · treasury · routine settlement |
| **ZK** | ZK proof of input/output binding | Regulated actions · immediate verifiability |
| **TEE** | Hardware attestation | High-frequency trading · maximum confidentiality |

The SAIL contract enforces minimum tier requirements for actions above defined value thresholds.

---

## Agent-to-Agent Flow

```
Hiring agent resolves worker.sail.eth
  → ENS returns: AXL peer ID · x402 endpoint · tier · stake status

Opens encrypted AXL channel
  → sends: task payload + pre-authorized x402 payment

Worker runs full SAIL pipeline
  → posts commitment on-chain
  → returns result + commitment_hash via AXL

Hiring agent verifies commitment exists
  → x402 settles: conditional on valid on-chain commitment

On dispute:
  → hiring agent requests audit via Lit
  → blob decrypted · hash verified
  → mismatch → slash
```

---

## Audit Flow

```
1. Auditor address is in Lit access conditions (set at registration)

2. Auditor requests decrypt for commitment CID
   → Lit nodes query SAIL contract: isAuthorized(auditorAddress)?
   → Threshold agree → blob decrypted

3. Auditor computes SHA256(plaintext)
   → compared against on-chain commitment_hash

4. CONSISTENT   → input-commit-execute chain proven intact
   INCONSISTENT → auditor calls sail_contract.slash(agentENS)
                → full stake slashed · registration suspended
```

---

## Storage

Blobs are AES-256 encrypted by Lit before leaving the MCP server.
Encrypted blobs are pinned to Filecoin via Storacha.

- **Free tier:** 30 days included at registration
- **Paid tier:** operator extends on deployment
- **Integrity:** CID on-chain is the proof. Changed content = changed CID. Tamper is immediate and detectable.
- **Availability:** lapsed storage means the agent cannot defend itself in an audit. Operator's responsibility, operator's risk.

---

## What SAIL Proves

SAIL proves that the input received, the commitment made, and the action executed are consistent and tamper-evident — verifiable by any authorized party at any time against the permanent on-chain record.

## What SAIL Does Not Prove

SAIL does not prove that the agent's reasoning was sound or that the LLM output was honest. The agent is a black box. SAIL makes the shell around that black box cryptographically accountable. Execution consistency is the guarantee. Cognitive correctness is out of scope and out of reach for any system.

---

## Why Each Integration Earns Its Prize

**AXL**
Agents discover each other through ENS, communicate tasks and results over AXL peer-to-peer, and deliver transactions through AXL with no centralized relayer. Every agent interaction — delegation, result delivery, payment, transaction submission — uses AXL as its communication layer. This is the multi-agent coordination use case with cryptographic accountability attached to every message.

**ENS**
ENS is not a label. It is the operational directory for the entire protocol. Every agent interaction begins with an ENS resolution that returns: AXL peer ID, x402 endpoint, trust tier, capabilities, stake status, and auditor addresses. Registration, discovery, trust signaling, and routing all flow through ENS. Remove ENS and the protocol has no agent directory, no discoverability, and no human-readable identity layer.

**KeeperHub**
SAIL ships as an MCP server. KeeperHub's execution layer picks it up natively. Any agent running on KeeperHub — ElizaOS, LangChain, CrewAI, OpenClaw — gets the full SAIL pipeline with zero additional integration. x402 payment settlement is built into the execution pipeline and conditioned on SAIL contract verification. This covers both KeeperHub focus areas: innovative use of the execution layer and payment integration.

---

## Stack Summary

| Component | Technology |
|---|---|
| Smart contract | Solidity · Base (EVM) |
| Key management + access control | Lit Protocol |
| MCP server | Node.js · MCP protocol |
| Agent identity | ENS · sail.eth namespace |
| Encrypted storage | Filecoin · Storacha |
| Agent communication | AXL encrypted mesh |
| Payment settlement | x402 |
| Framework support | CrewAI · LangChain · ElizaOS · OpenClaw · KeeperHub |