# SAIL Platform Architecture

This document is a practical architecture guide for product and frontend work.
Use it together with `docs/idea.md` (canonical protocol design) to keep UI, console paths, and backend integrations aligned.

---

## 1) Platform in one sentence

SAIL is a cryptographic accountability layer for AI agents operating on-chain: it binds inputs, commitment, and execution into a verifiable audit chain.

---

## 2) System layers

### Agent layer
- Any MCP-compatible agent framework (Cursor/Claude tooling, LangChain, CrewAI, custom).
- Agent invokes SAIL tools during its decision/execution flow.

### SAIL MCP + backend layer
- Exposes SAIL tools (`attest`, `commit`, `execute`, `deliver`, `audit/reveal` flows).
- Handles encryption + API orchestration.
- Serves API endpoints used by dashboard UIs (`/health`, reveal and audit request routes).

### On-chain enforcement layer
- SAIL smart contract on EVM.
- Enforces commit-before-execute and stores commitment anchors.
- Registry + stake state + slashing hooks.

### Privacy + storage layer
- Lit Protocol for key management/access conditions.
- 0G/Storacha for encrypted blob persistence (CID anchored on-chain).

### Identity + coordination layer
- ENS for agent identity/capabilities/discovery.
- AXL/x402 for agent-to-agent communication and conditional settlement.

---

## 3) Protocol flow (user-facing language)

The product should keep these six stages consistent in docs/UI:

1. **Attest inputs**  
   Hash the exact input set before reasoning.
2. **Reason**  
   Model/framework-specific reasoning (out of SAIL scope).
3. **Commit**  
   Encrypt + persist commitment; post hash/CID/nonce anchor on-chain.
4. **Execute**  
   Contract checks valid prior commitment; fails closed on mismatch.
5. **Deliver**  
   Submit transaction with tamper-evident delivery guarantees.
6. **Audit (on request)**  
   Authorized reveal + hash verification against on-chain commitment.

---

## 4) Frontend architecture

### Marketing surface
- Route: `/`
- Purpose: explain value proposition + protocol stages + integration story.
- Key components:
  - `HeroSection`
  - `ManifestoSection`
  - `ServicesSection` (pipeline)
  - `ProjectsSection` (use cases)
  - `AboutStatsSection`
  - `CTASection`
  - shared `Navbar`, `SiteFooter`, `CustomCursor`

### Console entry
- Route: `/dashboard`
- Purpose: role/path selection into operational consoles.
- Current paths:
  - **Operator**: `/dashboard/operator`
  - **Auditor**: `/dashboard/auditor`

---

## 5) Dashboard path model

This is the current mental model to guide dashboard implementation.

### Path A: Operator (`/dashboard/operator`)
- Goal: run/monitor agent operations and process audit requests.
- Current status: placeholder view (operator submodules not yet restored in this branch).
- Target modules:
  1. Agent registration/state
  2. Commitment + execution monitoring
  3. Audit request inbox + reveal/deny actions

### Path B: Auditor (`/dashboard/auditor`)
- Goal: request and inspect selective reveal evidence for a given agent/task.
- Current status: implemented panel for signed audit request flow + request status visibility.
- Next expansion:
  1. richer filtering/search for request history
  2. verification result breakdown (hash match, policy check, provenance)
  3. exportable evidence bundles

### Shared dashboard concerns
- Wallet connection + chain gating
- Backend health visibility
- Contract address/config status
- Clear error states for unavailable infra (API, chain mismatch, missing config)

---

## 6) Data + integration touchpoints

### Frontend config/env (`NEXT_PUBLIC_*`)
- `NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_SAIL_API_URL`
- `NEXT_PUBLIC_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_LOCAL_RPC_URL`
- `NEXT_PUBLIC_USE_LOCAL_CHAIN`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_LIT_NETWORK`

### Frontend integration modules
- `src/lib/sail-abi.ts` - contract ABI used by dashboard reads
- `src/lib/wagmi-config.ts` - chain/rpc/wallet + API base configuration
- `src/lib/operator-agent.ts` - local operator state keying

---

## 7) Immediate dashboard roadmap

1. Reintroduce Operator modules under `src/components/dashboard/operator/*` and wire back into `Operators_Dash`.
2. Keep `/dashboard` as the stable role selector and avoid direct deep links from landing CTAs unless role is explicit.
3. Add shared dashboard layout shell (header/footer + status strip) to reduce repeated scaffolding across operator/auditor pages.
4. Align all dashboard copy with `docs/idea.md` terminology (commitment, audit-on-request, slashing condition).

---

## 8) Source of truth rule

If this document and product copy differ from protocol details in `docs/idea.md`, update UI/docs to match `docs/idea.md`.
