# SAIL Frontend

Secure Agentic Intelligence Layer (SAIL) frontend built with Next.js.

This app contains:
- marketing site (`/`)
- console path selector (`/dashboard`)
- auditor dashboard (`/dashboard/auditor`)
- operator dashboard placeholder (`/dashboard/operator`)

The product architecture and protocol details are defined in `docs/idea.md`. This README gives a practical summary for frontend contributors.

## Core Concept

SAIL is a cryptographic accountability layer for AI agents operating on-chain.

For high-stakes actions, SAIL binds three facts:
- what the agent received (inputs)
- what the agent committed to (decision + proposed action)
- what the agent executed (final action)

The chain is cryptographically linked, contract-enforced, and auditable by authorized parties.

## Architecture Summary

High-level protocol architecture (from `docs/idea.md`):
- **Agent framework (MCP-compatible)** calls SAIL tools
- **SAIL MCP server** exposes tools and routes commitments
- **SAIL contract (EVM)** enforces commit-before-execute and registry/stake rules
- **Lit Protocol** handles encryption keys and access conditions
- **Filecoin / Storacha** stores encrypted blobs (CID anchored on-chain)
- **ENS / AXL / x402** support identity, communication, and conditional payment

Frontend responsibilities:
- explain protocol and pipeline clearly
- present console entry points (operator vs auditor)
- read on-chain contract state
- interact with backend APIs for health/reveal/audit request flows

## Pipeline (UI Language)

The frontend describes the six-stage enforced flow:
1. Attest inputs
2. Reason
3. Commit
4. Execute
5. Deliver
6. Audit (on request)

These labels should remain aligned with `docs/idea.md`.

## Project Structure

- `src/app/page.js` - landing page composition
- `src/app/dashboard/page.js` - path selector
- `src/app/dashboard/auditor/page.js` - auditor console route
- `src/app/dashboard/operator/page.js` - operator route (currently simplified placeholder)
- `src/components/landing/*` - landing sections and shared navbar/footer/cursor
- `src/components/dashboard/*` - dashboard UIs
- `src/lib/*` - ABI, config, helper utilities

## Configuration

Frontend uses `NEXT_PUBLIC_*` environment variables for chain/API config.

Key variables used in current code:
- `NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_SAIL_API_URL`
- `NEXT_PUBLIC_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_LOCAL_RPC_URL`
- `NEXT_PUBLIC_USE_LOCAL_CHAIN`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_LIT_NETWORK`

## Development

Install and run:

```bash
npm install
npm run dev
```

Checks:

```bash
npm run lint
npm run build
```

## Source of Truth

When copy or architecture details conflict, treat `docs/idea.md` as the canonical protocol reference and update UI/docs to match it.
