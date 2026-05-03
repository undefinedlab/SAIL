# 🔴 Gensyn / AXL — P2P Agent Mesh Integration

> **Gensyn Partner Prize Submission**

SAIL uses **AXL** — Gensyn's open P2P network — as the encrypted communication layer between AI agents. Agents register on the mesh with their ed25519 identity, delegate tasks to each other over encrypted channels, and receive cryptographically-proven results (commitment hashes) in return.

---

## Why We Need Gensyn / AXL

SAIL's accountability guarantee is only as strong as the network that delivers tasks between agents. If agent to agent communication runs over a centralized API, then:
- The operator of that API can read, modify, or drop messages
- A compromised intermediary can inject tasks that never came from the hiring agent
- There is no cryptographic proof that the result came from the intended worker

Without AXL, the SAIL multiagent model devolves into a web of API calls over HTTPS — trusted by convention, not by cryptography.

With **AXL**:
- Every node has a unique **ed25519 identity** — messages are signed at the transport layer, so the receiving agent knows the sender’s peer ID is genuine
- Communication runs over a **P2P mesh** built on the Yggdrasil network stack — no central relay, no single point of interception
- The AXL bridge runs in userspace with **no TUN interface or root privileges** required — any developer can spin up a node
- When a worker agent completes a delegated task, it returns the **commitment hash** — the hiring agent can verify this hash against the SAIL contract independently, without trusting the worker’s claim

AXL is the only part of SAIL that operates purely between agents. Everything else (contracts, storage, encryption) is anchored to Ethereum or 0G. AXL is what makes agents first-class participants rather than dumb API endpoints.

### How Gensyn / AXL Tech Stack Helps SAIL

| AXL Primitive | How SAIL Uses It |
|---------------|------------------|
| **ed25519 identity** | Each developer's node gets a unique keypair — the public key is the Peer ID stored on ENS and used for routing |
| **HTTP bridge (`GET /topology`, `POST /send`, `GET /recv`)** | SAIL communicates with the AXL node entirely over localhost HTTP — no Go SDK dependency |
| **`POST /send` + `X-Destination-Peer-Id`** | Operator sends `sail.task` messages to a worker's peer ID resolved from ENS |
| **`GET /recv`** | Worker polls for incoming task messages; operator polls for `sail.result` replies |
| **Yggdrasil + gVisor network stack** | Encrypted overlay network in userspace — no root, no port forwarding, no TUN |
| **Auto-build from source** | SAIL clones `gensyn-ai/axl` and runs `go build ./cmd/node/` — no binary distribution needed |
| **Task router (3-second poll)** | Worker side: receives `sail.task`, runs full SAIL pipeline, sends `sail.result` back automatically |

---

## What We Built

AXL is the nervous system of multiagent SAIL. Without it, agents are isolated. With AXL:

- An operator agent can **delegate** a task to a worker agent on another machine
- The worker runs the **full SAIL pipeline** autonomously and sends back the commitment hash as proof
- The commitment hash is anchored onchain — the hiring agent has cryptographic proof the worker ran SAIL correctly

```
Without AXL:    Agent A ──→ API call ──→ Agent B   (trust on API response)

With AXL:       Agent A ──[AXL P2P mesh]──→ Agent B
                                              ├── attest inputs
                                              ├── reason (0G Compute)
                                              ├── commit onchain
                                              ├── execute gate
                                              └── send commitment hash back via AXL
```

---

## Architecture

### Source Files

| File | Purpose |
|------|---------|
| `backend/gensyn/node.ts` | Clone gensyn-ai/axl, build Go binary, spawn node, manage process |
| `backend/gensyn/client.ts` | HTTP bridge client — topology, send, recv, health check |
| `backend/gensyn/task-router.ts` | Worker delegation loop — process `sail.task`, return `sail.result` |

### Node Manager (`node.ts`)

The AXL binary doesn't ship pre-built. On first boot, SAIL:

```
1. mkdirSync(.axl/)
2. git clone --depth 1 https://github.com/gensyn-ai/axl .axl/repo/
3. go build ./cmd/node/  →  .axl/repo/node
4. openssl genpkey -algorithm ed25519 -out .axl/private.pem
5. write .axl/node-config.json  (ports, key path, peers from env)
6. spawn ./node -config node-config.json
7. poll GET /topology every 500ms until alive
```

The binary is cached. Subsequent starts skip steps 2–3 unless `.axl/repo/node` is deleted.

### HTTP Bridge (`client.ts`)

AXL exposes a local HTTP bridge at `localhost:9002`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /topology` | — | Peer ID, IPv6, connected peers, spanning tree |
| `POST /send` | `X-Destination-Peer-Id: <hex>` | Send raw bytes to a peer |
| `GET /recv` | — | Dequeue one inbound message (204 = empty) |

SAIL wraps raw bytes in a thin JSON envelope preserving topic and timestamp:

```typescript
type SailEnvelope = {
  __sail_axl_envelope: true;
  message: string;   // JSON-serialized payload
  topic?: string;    // "sail.task" | "sail.result" | "sail.ack" | "sail.error"
  timestamp: number;
};
```

### Task Router (`task-router.ts`)

The task router runs a background poll every 3 seconds, routing messages by type:

```
sail.task   → processIncomingTask()
               1. Send sail.ack back
               2. pipeline.attestInputs(task + context)
               3. pipeline.reason()   via 0G Compute
               4. pipeline.commit()   encrypt + 0G Storage + SAIL contract
               5. pipeline.execute()  clear gate
               6. Send sail.result back

sail.result → update DelegationRecord.status = "completed"
sail.error  → update DelegationRecord.status = "failed"
```

---

## Message Protocol

```typescript
// Operator sends:
{ type: "sail.task", from: peerId, taskId: uuid, task: string,
  context: unknown, agentEns: string, replyTopic: "sail.result", timestamp }

// Worker responds (on success):
{ type: "sail.result", from: peerId, taskId, commitmentHash, cid,
  txHash, output, model, verified, timestamp }

// Worker responds (on failure):
{ type: "sail.error", from: peerId, taskId, error: string, timestamp }

// Worker acks receipt:
{ type: "sail.ack", taskId, status: "processing" }
```

---

## Node Identity

Each AXL node has a unique **ed25519 identity**:

```
private.pem      → ed25519 private key (never share, never commit)
public key       → 64-char hex = Peer ID
IPv6 address     → derived from public key (Yggdrasil-style)
```

The Peer ID is set as the `axl_peer_id` text record on the agent's ENS name so other agents can look it up:

```bash
curl http://localhost:3001/api/ens/resolve/0x17swarn.sail.eth
# { "records": { "axl_peer_id": "699a15da...041d84", ... } }
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/axl/status` | Node health, peer ID, IPv6, connected peers |
| `POST` | `/api/axl/send` | Send a raw message to a peer |
| `GET` | `/api/axl/recv` | Poll inbox for messages |
| `GET` | `/api/axl/topology` | Full topology (peers + spanning tree) |
| `GET` | `/api/axl/discover/:ens` | Resolve ENS → AXL peer ID + capabilities |
| `POST` | `/api/axl/delegate` | Delegate a task to a worker agent |
| `GET` | `/api/axl/delegations` | List all outbound delegations |
| `GET` | `/api/axl/delegations/:id` | Poll status of a specific delegation |
| `GET` | `/api/axl/tasks` | List tasks this node processed (worker side) |
| `POST` | `/api/axl/router/start` | Start task router background poller |
| `POST` | `/api/axl/router/stop` | Stop task router |

---

## Setup

### Prerequisites

```bash
# Go is required to build the AXL binary
brew install go        # macOS
# or
sudo apt install golang # Ubuntu/Debian

go version  # must be 1.21+

# OpenSSL for key generation (pre-installed on macOS/Linux)
openssl version
```

### Environment Variables

```env
# AXL (add to backend/.env)
AXL_AUTO_START=true              # Clone, build, and start AXL on backend boot
AXL_BRIDGE_URL=http://localhost:9002   # Bridge URL (default)
AXL_TCP_PORT=7000                # TCP port for peer connections (default)
AXL_PEERS=                       # Comma-separated peer URLs (empty = no initial peers)
AXL_LISTEN=                      # Comma-separated listen addresses (empty = client-only)
```

### Public Node Configuration

To become a public node that other agents can peer with:

```env
AXL_LISTEN=tls://0.0.0.0:9001   # Expose port 9001 to the internet
```

Connect peers to you:
```env
AXL_PEERS=tls://YOUR_PUBLIC_IP:9001
```

### Manual Start (without auto-start)

```bash
# From backend/
cd .axl/repo
openssl genpkey -algorithm ed25519 -out ../private.pem
./node -config ../node-config.json
```

### Set Your Peer ID on ENS

After node starts, get your peer ID and set it on your ENS name:

```bash
# Get your peer ID
curl http://localhost:9002/topology | python3 -c "import sys,json;print(json.load(sys.stdin)['our_public_key'])"

# Set it via the Identity tab in the frontend dashboard, or:
curl -X POST http://localhost:3001/api/ens/update \
  -H "Content-Type: application/json" \
  -d '{"ensName":"myagent.sail.eth","records":{"axl_peer_id":"<your-peer-id>"}}'
```

---

## Multi-Node Delegation Example

```bash
# On Machine A (operator):
curl -X POST http://localhost:3001/api/axl/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "workerEns": "worker.sail.eth",
    "task": "Analyze: should we sell 5 ETH given current market conditions?",
    "agentEns": "operator.sail.eth"
  }'
# { "id": "uuid", "status": "pending", "workerPeerId": "699a..." }

# Poll for result:
curl http://localhost:3001/api/axl/delegations/<id>
# { "status": "completed", "result": { "commitmentHash": "0x...", "cid": "0x...", "txHash": "0x...", "output": "..." } }
```

---

## Known Limitations

1. **Single node** — currently running one AXL node. Delegation to self works. Cross-machine delegation requires a second developer running their own node with `AXL_AUTO_START=true`.
2. **No bootstrap peers** — two nodes need at least one public IP between them to establish initial connectivity. Set `AXL_LISTEN` on one machine and `AXL_PEERS` on the other.
3. **Build time** — first start takes 2–5 minutes to clone and build the Go binary. Subsequent starts use the cached binary.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| `gensyn-ai/axl` | P2P mesh node (Go binary, built from source) |
| `node:child_process` | Spawn and manage the AXL process |
| `openssl genpkey` | ed25519 key generation |
| `fetch` | AXL HTTP bridge client |
| Yggdrasil + gVisor | Underlying network stack (no TUN required) |
