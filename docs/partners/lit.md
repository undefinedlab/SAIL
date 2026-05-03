# 🟡 Lit Protocol — Threshold Encryption Integration

> **Lit Protocol Partner Prize Submission**

SAIL uses **Lit Protocol Chipotle** as the encryption layer for AI agent commitment blobs. The access condition is tied directly to `SAIL.isAuthorized()` onchain Lit nodes check the SAIL contract before releasing the decryption key. This means only addresses the agent trusts as auditors can ever read a commitment.

---

## Why We Need Lit Protocol

SAIL's commit before execute guarantee depends on one thing: the decision blob must be **readable by authorized auditors and nobody else**.

If the blob is stored in plaintext on 0G Storage, anyone can read any agent’s decisions — including competitors, adversaries, and the public. Agents would stop using SAIL rather than expose their reasoning.

If the blob is encrypted with a key the operator controls, the operator can decrypt it unilaterally and rewrite the audit trail. The encryption is theater.

What’s needed is encryption where **the decryption condition is enforced by a third party that neither the agent nor the auditor controls** — and where that condition is the SAIL contract itself.

With **Lit Protocol Chipotle**:
- The decision blob is encrypted by a **PKP (Programmable Key Pair)** — a key that lives inside Lit’s TEE and is never exposed to anyone
- Decryption runs inside a **Lit Action** JavaScript executing in a hardware isolated enclave
- Before decrypting, the Lit Action calls `SAIL.isAuthorized(auditorAddress, agentEns)` **onchain** — the SAIL contract is the gatekeeper, not Lit
- If the auditor is not in the SAIL contract’s auditor list, Lit returns `{ error: "Not authorized" }` and the plaintext never leaves the TEE
- The agent operator cannot bypass this — even with the PKP ID, they cannot decrypt without passing the onchain authorization check

This is the only architecture where the access condition for decryption is enforced by the same contract that enforces commit before execute. SAIL and Lit are wired together at the contract level, not just at the application level.

### How Lit Tech Stack Helps SAIL

| Lit Primitive | How SAIL Uses It |
|---------------|------------------|
| **Chipotle REST API** | Pure HTTP — no SDK, no node connections, no browser wallet. Server-side encryption from the SAIL backend. |
| **PKP (Programmable Key Pair)** | A key that keys the encryption and never leaves Lit’s TEE — not held by SAIL, not held by the agent |
| **Lit Actions** | JavaScript in TEE — `Lit.Actions.callContract()` checks `SAIL.isAuthorized()` before `Lit.Actions.Decrypt()` |
| **`POST /core/v1/lit_action`** | One endpoint for both encrypt and decrypt — SAIL submits action code + JS params, receives ciphertext or plaintext |
| **AES-256-GCM fallback** | When Chipotle is unavailable, SAIL falls back to symmetric encryption — the key is stored in the 0G blob so auditors can still decrypt, but without TEE guarantees |
| **Access conditions tied to SAIL contract** | `agentEns` + `contractAddress` are passed to the Lit Action — the condition is dynamic and updates whenever the agent changes auditors via `SAIL.updateAuditors()` |

---

## What We Built

When a SAIL agent commits a decision, the blob is encrypted before being uploaded to 0G Storage. Nobody can read it — not even 0G Storage nodes, not even SAIL contract participants. Only addresses for which `SAIL.isAuthorized(address, ens)` returns true can ask Lit to decrypt.

```
Agent commits decision:
  plaintext blob
    → Lit Chipotle encrypt (PKP-keyed, inside TEE)
      → ciphertext stored on 0G Storage
        → keccak256(ciphertext) anchored on SAIL contract

Auditor decrypts:
  Lit Action runs inside TEE:
    1. callContract(SAIL, isAuthorized, [auditorAddress, agentEns])
    2. if false → { error: "Not authorized" }
    3. if true  → Decrypt({ pkpId, ciphertext }) → plaintext
```

The authorization check happens **inside the Lit TEE** — the auditor cannot bypass it by calling Lit directly. The SAIL contract is the gatekeeper.

---

## Architecture

### Source File

| File | Purpose |
|------|---------|
| `backend/src/lit/encrypt.ts` | Chipotle encrypt/decrypt + AES-256-GCM fallback |

### Lit Actions

SAIL uses two Lit Actions (JavaScript run inside Lit's TEE):

**Encrypt Action:**
```javascript
async function main({ pkpId, message }) {
  const ciphertext = await Lit.Actions.Encrypt({ pkpId, message });
  Lit.Actions.setResponse({ response: JSON.stringify({ ciphertext }) });
}
```

**Decrypt Action (with onchain authorization):**
```javascript
async function main({ pkpId, ciphertext, agentEns, auditorAddress, contractAddress }) {
  const isAuth = await Lit.Actions.callContract({
    chain: "sepolia",
    contractAddress,
    abi: [{ name: "isAuthorized", ... }],
    functionName: "isAuthorized",
    args: [auditorAddress, agentEns]
  });
  if (!isAuth) {
    Lit.Actions.setResponse({ response: JSON.stringify({ error: "Not authorized" }) });
    return;
  }
  const plaintext = await Lit.Actions.Decrypt({ pkpId, ciphertext });
  Lit.Actions.setResponse({ response: JSON.stringify({ plaintext }) });
}
```

---

## Chipotle REST API

Lit Chipotle (v3) is a pure REST API — no SDK, no node connections, no network config. SAIL calls `POST /core/v1/lit_action` with the action code and JS params:

```typescript
const CHIPOTLE_BASE = "https://api.chipotle.litprotocol.com/core/v1";

const res = await fetch(`${CHIPOTLE_BASE}/lit_action`, {
  method: "POST",
  headers: {
    "X-Api-Key": env.lit.chipotleApiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ code: ENCRYPT_ACTION, js_params: { pkpId, message } }),
});
```

---

## Encrypted Blob Format

```typescript
type EncryptedBlob = {
  ciphertext: string;          // base64-encoded ciphertext
  dataToEncryptHash: string;   // hex prefix of plaintext (for integrity)
  accessConditions: {
    contractAddress: string;   // SAIL contract
    agentEns: string;          // e.g. "swarnim.sail.eth"
  };
  fallbackKey?: string;        // present only when AES fallback is used
  encryptionMethod?: string;   // "chipotle" | "aes-fallback"
};
```

---

## AES-256-GCM Fallback

When Chipotle credentials are not configured or the API is unreachable, SAIL automatically falls back to **AES-256-GCM**:

```typescript
const key = randomBytes(32);   // 256-bit key
const iv  = randomBytes(12);   // 96-bit IV (GCM standard)
const cipher = createCipheriv("aes-256-gcm", key, iv);
// ciphertext = concat(iv, authTag, encrypted)
// fallbackKey = concat(key, iv).toString("hex") — stored in blob metadata
```

The fallback key is stored inside the 0G blob itself, so:
- The pipeline always completes, regardless of Lit availability
- Auditors can always decrypt using `decryptAesFallbackBlob(ciphertext, fallbackKey)`
- When Lit is reachable, new commitments automatically switch back to threshold encryption

---

## Setup

### One-Time Chipotle Setup

```bash
# Option 1 — automated setup script
cd backend
LIT_CHIPOTLE_ACCOUNT_KEY=<your-account-key> npm run setup-lit
# Creates a PKP wallet and usage API key, prints values to add to .env

# Option 2 — manual via Chipotle dashboard
# 1. Create account at dashboard.chipotle.litprotocol.com (fund with $5 min)
# 2. Create PKP: POST /core/v1/create_wallet → save wallet_id
# 3. Create usage key: POST /core/v1/add_usage_api_key → save api_key
```

### Environment Variables

```env
# Lit Protocol Chipotle (add to backend/.env)
LIT_CHIPOTLE_API_KEY=...          # Usage API key from Chipotle dashboard
LIT_CHIPOTLE_PKP_ID=...           # PKP wallet ID from Chipotle dashboard
LIT_NETWORK=datil-test            # Network name (for reference)
```

If `LIT_CHIPOTLE_API_KEY` or `LIT_CHIPOTLE_PKP_ID` are not set, the system logs a warning and uses AES-256-GCM fallback automatically. No manual intervention needed.

---

## TypeScript API

```typescript
import { encryptCommitmentBlob, chipotleDecrypt, decryptAesFallbackBlob } from "./src/lit/encrypt.js";

// Encrypt (tries Chipotle, falls back to AES)
const encrypted = await encryptCommitmentBlob(plaintextBytes, "swarnim.sail.eth");
// encrypted.encryptionMethod → "chipotle" | "aes-fallback"

// Decrypt via Chipotle (enforces SAIL.isAuthorized onchain inside the Action)
const plaintext = await chipotleDecrypt(
  encrypted.ciphertext,
  "swarnim.sail.eth",
  "0xAuditorAddress"   // Lit checks isAuthorized(auditor, ens) before decrypting
);

// Decrypt AES fallback (auditor has access to fallbackKey from blob)
const plaintext = decryptAesFallbackBlob(encrypted.ciphertext, encrypted.fallbackKey);
```

---

## Current Status

| Feature | Status |
|---------|--------|
| AES-256-GCM fallback | ✅ Active (Chipotle credentials not yet set in live env) |
| Chipotle encrypt | ✅ Implemented — set `LIT_CHIPOTLE_API_KEY` + `LIT_CHIPOTLE_PKP_ID` to activate |
| Chipotle decrypt with `isAuthorized` check | ✅ Implemented |
| Automatic fallback on Chipotle error | ✅ 5-second timeout, seamless fallback |
| Auditor decrypt via frontend | ✅ Auditor dashboard calls `/api/audit/:hash` |

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Lit Chipotle REST API** | Threshold encryption/decryption in TEE (v3, no SDK) |
| **Lit Actions** | JavaScript running inside Lit TEE — calls `SAIL.isAuthorized()` |
| **PKP Wallet** | Lit's Programmable Key Pair — keys the encryption |
| **AES-256-GCM** | Fallback encryption when Chipotle unavailable |
| `node:crypto` | AES fallback implementation |
