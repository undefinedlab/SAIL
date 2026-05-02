# Agent registration — new users vs operator-backed demo

SAIL has two different stories, depending on whether the **caller of `register()` on the contract** is your **shared backend operator** or each user’s **own wallet**.

---

## How the contract works

`register(string ens, uint8 tier, address[] auditors)` is **payable** and sets:

- `agents[ens].wallet = msg.sender` (whoever sent the transaction)
- stake from `msg.value`
- auditors list (used for Lit / slash authorization)

`commit` and `execute` only require the agent to be **active**; they do **not** require `msg.sender` to equal `agents[ens].wallet`. So the **hosted backend** can keep using one operator key to drive the whole pipeline via API/MCP, while each agent is still a distinct **ENS name** on the same contract.

---

## Path A — Operator-backed (what the repo ships today)

**Who registers:** The backend calls `POST /api/register` using `OPERATOR_PRIVATE_KEY`.

**Effect:** Every agent registered this way has **`wallet` = operator address** on-chain. You get many ENS identities (e.g. `alice.sail.eth`, `bob.sail.eth`), but **one** custodial operator wallet for stake top-ups / auditor updates.

**What a “new user” does manually:**

1. **ENS subname (optional but typical)**  
   - Dashboard: **Register** tab → ENS subname flow (`POST /api/ens/register`), or  
   - API with `subLabel` + text records under `ENS_PARENT_NAME` (e.g. `sail.eth`).  
   - Requires the **operator** to own the parent name (your hackathon setup).

2. **SAIL contract registration**  
   - Dashboard: register agent with full ENS, tier, auditors, stake — hits **`POST /api/register`**.  
   - Or `curl` the same endpoint against your backend.

Nothing runs **fully automatically** for a stranger unless **you** add automation (e.g. after payment, cron, or “one-click demo” that chains ENS + register). Out of the box it is **one form / two API calls**, not magic.

**MCP:** Call **`sail_register`** with `ens`, `auditors`, optional `tier` / `stakeEth` — same semantics as **`POST /api/register`** (operator-signed). ENS subname under `*.sail.eth` is still a separate step (dashboard or **`POST /api/ens/register`**) unless the name already exists.

---

## Path B — Self-custody (each user’s own wallet)

**Who registers:** The user sends `register(...)` **from their own browser wallet** (or Etherscan / `cast`, etc.) with ETH stake.

**Effect:** `agents[ens].wallet` is **their** address. They control stake and auditor updates.

**What you must provide:**

- A **wallet-connected** UI that calls the SAIL contract, **or** clear instructions + contract link on Sepolia.  
- ENS still has to **exist as a string** the contract accepts (typically a name they control or that matches your product’s naming).

The current **dashboard** path is optimized for **Path A**, not for arbitrary wallets calling `register` directly.

---

## What to tell judges

| Question | Answer |
|----------|--------|
| Can a new user get an agent? | **Yes** — create ENS subname (if you use `*.sail.eth`) + **`POST /api/register`** (or dashboard). |
| Is it automatic? | **No** — unless you build automation. Default is **guided manual** steps. |
| Does MCP register them? | **Yes** — tool **`sail_register`** (operator-backed `wallet`). ENS subname may still be a separate step. |
| Can users truly “own” the agent on-chain? | Only if they **Path B** `register` from their own wallet; Path A is **operator-linked** `wallet`. |

---

## Optional product follow-ups

- **Wallet connect** on the frontend for Path B.  
- **Single endpoint** that chains `ens/register` + `register` for a chosen `subLabel` (semi-automatic onboarding).
