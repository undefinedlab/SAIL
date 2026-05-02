# SAIL frontend — use cases

This document describes how real workflows map to the **Next.js app**, the **SAIL backend** (HTTP API or MCP), and on-chain steps. The API base URL is usually the same host as the app (rewrites in `next.config.mjs`) or an explicit `NEXT_PUBLIC_SAIL_API_URL` pointing at your deployed backend (e.g. Railway).

---

## Use case 1: Operator runs the full pipeline from the dashboard

**Goal:** An operator wants to bind “what the system saw” and “what it decided” before any gated action, then clear the on-chain execute step.

**Actors:** Operator (wallet + configured backend with `OPERATOR_PRIVATE_KEY`).

**Flow:**

1. **Register (once per agent)** — Either use the operator dashboard flows that call `POST /api/register`, or register out-of-band (MCP `sail_register`, scripts). You need a registered `agentEns` (e.g. `myagent.sail.eth`) with stake and auditors.
2. **Attest (stage 01)** — Capture a JSON-serialisable snapshot of inputs (task, constraints, context). The backend returns `inputHash` (`POST /api/attest`). The UI in **Dashboard → operator** drives this via `sail-api` helpers.
3. **Reason (stage 02, optional)** — For ZK-oriented tiers, call `POST /api/reason` so **0G Compute** sealed inference produces output and optionally an attestation; that text feeds the human-readable **decision** and can be attached to the commit blob.
4. **Commit (stage 03)** — Submit `agentEns`, `inputHash`, `decision`, and `proposedAction` (and optional `attestation`) to `POST /api/commit`. The server encrypts the blob (Lit or AES fallback), uploads to **0G Storage**, and anchors `commitmentHash` + `cid` on the **SAIL contract**. Save `commitmentHash` and `cid`.
5. **Execute (stage 04)** — Call `POST /api/execute` with `agentEns` and `commitmentHash`. The contract enforces that this commitment exists and is eligible; the operator wallet signs the execute transaction.

**What triggers what:** The browser only sends HTTP requests. There is no background job: each step is a deliberate user action in the dashboard, which uses `src/lib/sail-api.ts` against `/api/*` (proxied to the real backend).

---

## Use case 2: Developer “commit before execute” inside Cursor (MCP)

**Goal:** An AI agent in the IDE must **record a decision on-chain** before describing or performing a sensitive follow-up action, without using the web UI.

**Actors:** Developer with **Cursor** (or any MCP client) connected to the SAIL MCP server — local stdio (`npm run mcp` in `backend`) or **Streamable HTTP** (`https://<host>/mcp` on the same process as the API).

**Flow:**

1. **Register** — If the ENS agent does not exist yet, the model (or user) calls **`sail_register`** with `ens`, `auditors`, and optional `tier` / `stakeEth`. ENS subnames under your configured parent may be created when applicable.
2. **Either** call **`sail_think_with_sail`** once with `inputs`, `decision`, `proposedAction`, and optional `runExecute` (it runs attest + commit and embeds `inputs` as **`auditContext`** in the sealed blob for audit), **or** chain tools:
3. **`sail_attest_inputs`** — Pass a single JSON `inputs` object; store the returned **`inputHash`**.
4. **Reason in the chat turn** — The model produces `decision` and `proposedAction` (and optional sealed-inference `attestation` if you integrated reason separately). This is off-tool reasoning between attest and commit by design.
5. **`sail_commit`** — Send `agentEns`, `inputHash`, `decision`, `proposedAction`; optional **`auditContext`** mirrors `inputs` for auditors. Persist **`commitmentHash`** (and `cid` / tx references from the response).
6. **`sail_execute`** — Send `agentEns` and `commitmentHash` to clear the contract gate.

**What triggers what:** Cursor invokes MCP tools; each tool maps to the same `pipeline` and contract code as the REST API. No frontend is required. If MCP HTTP uses a Bearer token, configure `Authorization` in `.cursor/mcp.json` to match `MCP_HTTP_TOKEN` on the server.

---

## Use case 3: Auditor verifies a commitment without operating the agent

**Goal:** A designated **auditor** (on-chain `isAuthorized`) checks that the sealed blob matches the anchored commitment and that execution state is consistent — without using the operator’s keys.

**Actors:** Auditor wallet (must appear in the agent’s `auditors` list on the contract); read access to the backend and 0G.

**Flow:**

1. **Obtain `commitmentHash`** — From an explorer, operator handoff, or `GET /api/commitments/:hash` (via proxy: `/api/commitments/...` from the app’s origin).
2. **Audit endpoint** — `GET /api/audit/:commitmentHash` loads on-chain metadata, fetches the encrypted object from 0G via the backend, and returns structured results. For **AES fallback** blobs, the server may recover plaintext and verify hashes; for **Lit** blobs, decrypt typically requires a Lit-capable client and the access conditions tied to the SAIL contract.
3. **Dashboard** — The **Auditor** dashboard page (`/dashboard/auditor`) is oriented around this path: paste hash, inspect reveal / verification messaging, align with `src/lib/sail-reveal-client.ts` patterns where applicable.

**What triggers what:** Read-only and audit routes on the server; the auditor does not call `commit` or `execute` unless they are also the operator (separate role in production).

---

## Use case 4: Health check and API discovery before integrating

**Goal:** A frontend or script author confirms the deployed stack is reachable and matches the chain/contract the UI expects.

**Flow:**

1. **`GET /health`** — Confirms `ok`, `contract`, `operator`, `chainId`, and MCP path hints. From the Next app, this is often requested as same-origin `/health` (rewrite) or via `healthCheck()` in `sail-api.ts` when `NEXT_PUBLIC_SAIL_API_URL` is set.
2. **`GET /api/agents/:ens`** — Validates a known agent is registered and returns nonce/stake/tier for UI preconditions.
3. **CORS** — Browser calls that hit the Railway host directly must use a backend `CORS_ORIGIN` that includes your site’s origin; same-origin proxy avoids CORS for `/api` and `/health` when users only talk to the Next deployment.

**What triggers what:** Purely diagnostic HTTP; no on-chain writes.

---

## Summary table

| Use case              | Primary surface      | Writes on-chain?        |
|-----------------------|----------------------|-------------------------|
| Operator pipeline     | Dashboard (operator) | Register, commit, execute |
| Cursor MCP flow       | MCP tools            | Register (if needed), commit, execute |
| Auditor verification  | Dashboard (auditor) + GET audit | Usually no             |
| Integration smoke     | `/health`, read APIs | No                      |

For step-by-step MCP ordering and project rules, see the repo’s `usecase/cursor/example-flow.md` and `.cursor/rules/sail-mcp-audit-flow.mdc`.
