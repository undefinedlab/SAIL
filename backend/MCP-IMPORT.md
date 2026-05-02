# Importing SAIL MCP (one URL)

## Cursor / Claude-style config

Add a server entry with **only** the Streamable HTTP URL (same host as your API):

```json
{
  "mcpServers": {
    "sail": {
      "url": "https://YOUR-SAIL-HOST.up.railway.app/mcp"
    }
  }
}
```

If the server sets **`MCP_HTTP_TOKEN`**, add:

```json
{
  "mcpServers": {
    "sail": {
      "url": "https://YOUR-SAIL-HOST.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

## Session + scaling (important)

Streamable HTTP MCP keeps **in-memory sessions** (`Mcp-Session-Id`). That works reliably when:

- The SAIL service runs **one replica**, or
- Your platform provides **sticky sessions** to the same instance.

If you scale to **multiple replicas** without stickiness, clients may see **“Missing or unknown Mcp-Session-Id”** because the next request hits a different process.

**Mitigations:**

1. Set **Railway / deploy replicas = 1** for the SAIL HTTP service, or enable sticky routing if available.
2. Optional: set **`MCP_HTTP_ENABLE_JSON_RESPONSE=true`** — may help some clients (still session-based).
3. Use **sessionless invoke** (below) for automation or multi-replica.

## Sessionless invoke (same tools, no JSON-RPC session)

`POST /api/mcp/invoke` runs the **same** tool implementations as MCP. Auth matches MCP (`Authorization: Bearer …` or `X-SAIL-MCP-Token` when `MCP_HTTP_TOKEN` is set).

```bash
curl -sS -X POST "https://YOUR-SAIL-HOST.up.railway.app/api/mcp/invoke" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "tool": "sail_think_with_sail",
    "arguments": {
      "agentEns": "myagent.sail.eth",
      "inputs": { "userPrompt": "hello" },
      "decision": "…",
      "proposedAction": "…",
      "runExecute": false
    }
  }'
```

List tool names: `GET /api/mcp/tools` (also respects invoke enable + token when configured).

Disable invoke: `MCP_HTTP_INVOKE=false`.
