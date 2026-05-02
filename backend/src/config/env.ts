import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

function asInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} is not a valid integer: ${v}`);
  return n;
}

/** Optional block number for `eth_getLogs` (decimal or `0x` hex). Unset = from genesis (can break on cheap RPCs). */
function optionalBigIntBlock(name: string, fallback: bigint): bigint {
  const v = process.env[name];
  if (!v || !v.trim()) return fallback;
  try {
    return BigInt(v.trim());
  } catch {
    throw new Error(`Env var ${name} must be a decimal or 0x-prefixed block number: ${v}`);
  }
}

export const env = {
  server: {
    port: asInt("PORT", 3001),
    host: optional("HOST", "0.0.0.0"),
    /** Comma-separated browser origins allowed by CORS. Includes local dev + deployed API host. */
    corsOrigin: optional(
      "CORS_ORIGIN",
      "http://localhost:3000,http://127.0.0.1:3000,https://sail-production-50ff.up.railway.app",
    ),
  },
  sail: {
    contractAddress: required("SAIL_CONTRACT_ADDRESS"),
    chainId: asInt("SAIL_CHAIN_ID", 11155111),
    rpcUrl: required("ETH_SEPOLIA_RPC_URL"),
    operatorKey: required("OPERATOR_PRIVATE_KEY"),
    /**
     * Lower bound for CommitmentPosted log queries. Public RPCs often reject `eth_getLogs` from block 0
     * or rate-limit parallel calls — set this to the block where SAIL was deployed (or a recent safe height).
     */
    logsFromBlock: optionalBigIntBlock("SAIL_LOGS_FROM_BLOCK", 0n),
  },
  zeroG: {
    rpcUrl: optional("ZERO_G_RPC_URL", "https://evmrpc-testnet.0g.ai"),
    indexerUrl: optional("ZERO_G_INDEXER_URL", "https://indexer-storage-testnet-turbo.0g.ai"),
    kvNodeUrl: optional("ZERO_G_KV_NODE_URL", "https://kv-testnet.0g.ai"),
    privateKey: required("ZERO_G_PRIVATE_KEY"),
    computeProvider: optional("ZERO_G_COMPUTE_PROVIDER", ""),
  },
  lit: {
    network: optional("LIT_NETWORK", "datil-test"),
    /** Lit Chipotle usage API key (optional — AES fallback when unset). */
    chipotleApiKey: optional("LIT_CHIPOTLE_API_KEY", ""),
    /** Lit Chipotle PKP / wallet id for encrypt-decrypt (optional). */
    chipotlePkpId: optional("LIT_CHIPOTLE_PKP_ID", ""),
  },
  axl: {
    /**
     * AXL HTTP bridge. Local default is the standard port; on Railway set a reachable URL
     * (public bridge or sidecar), not localhost.
     */
    bridgeUrl: optional("AXL_BRIDGE_URL", "http://localhost:9002"),
    /**
     * Auto-build and run the AXL node on boot (needs Go + git + network). On PaaS (e.g. Railway)
     * this usually fails unless the image includes Go; set `AXL_AUTO_START=false` and use an external
     * bridge, or set `AXL_AUTO_START_IN_PRODUCTION=true` when your runtime actually has Go 1.25+.
     */
    autoStart:
      optional("AXL_AUTO_START", "false") === "true" &&
      (process.env["NODE_ENV"] !== "production" ||
        optional("AXL_AUTO_START_IN_PRODUCTION", "false") === "true"),
  },
  ens: {
    /** Parent ENS name the operator owns. Subnames are minted under it. */
    parentName: optional("ENS_PARENT_NAME", ""),
  },
  mcpHttp: {
    /** Streamable HTTP MCP (Cursor remote url). Default 3002 so it can run beside API on 3001. */
    port: asInt("MCP_HTTP_PORT", 3002),
    /** If set, require `Authorization: Bearer <token>` or `X-SAIL-MCP-Token`. */
    token: optional("MCP_HTTP_TOKEN", ""),
    /**
     * When true, Streamable HTTP transport uses JSON responses where possible (SDK flag).
     * May help some clients; sessions are still in-memory — use one replica or POST /api/mcp/invoke.
     */
    enableJsonResponse: optional("MCP_HTTP_ENABLE_JSON_RESPONSE", "false") === "true",
    /** POST /api/mcp/invoke — same tools as MCP, no JSON-RPC session (default on). */
    invokeEnabled: optional("MCP_HTTP_INVOKE", "true") === "true",
    /**
     * Comma-separated Host header values allowed when binding to 0.0.0.0 (DNS rebinding).
     * Example: `myapp.up.railway.app,localhost:3002`
     */
    allowedHosts: optional("MCP_ALLOWED_HOSTS", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
} as const;

export type Env = typeof env;

/**
 * Value for `cors({ origin })`. Comma-separated `CORS_ORIGIN` becomes an array so browsers get a
 * single reflected `Access-Control-Allow-Origin` (a comma-separated list in one header is invalid).
 */
export function corsOriginOption(): boolean | string | string[] {
  const raw = env.server.corsOrigin.trim();
  if (raw === "*") return true;
  const parts = raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (parts.length === 0) {
    return ["http://localhost:3000", "https://sail-production-50ff.up.railway.app"];
  }
  if (parts.length === 1) return parts[0]!;
  return parts;
}
