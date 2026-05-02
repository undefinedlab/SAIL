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

export const env = {
  server: {
    port: asInt("PORT", 3001),
    host: optional("HOST", "0.0.0.0"),
    corsOrigin: optional("CORS_ORIGIN", "http://localhost:3000"),
  },
  sail: {
    contractAddress: required("SAIL_CONTRACT_ADDRESS"),
    chainId: asInt("SAIL_CHAIN_ID", 11155111),
    rpcUrl: required("ETH_SEPOLIA_RPC_URL"),
    operatorKey: required("OPERATOR_PRIVATE_KEY"),
  },
  zeroG: {
    rpcUrl: optional("ZERO_G_RPC_URL", "https://evmrpc-testnet.0g.ai"),
    indexerUrl: optional("ZERO_G_INDEXER_URL", "https://indexer-storage-testnet-turbo.0g.ai"),
    kvNodeUrl: optional("ZERO_G_KV_NODE_URL", "https://kv-testnet.0g.ai"),
    privateKey: required("ZERO_G_PRIVATE_KEY"),
    computeProvider: optional("ZERO_G_COMPUTE_PROVIDER", ""),
  },
  lit: {
    network: optional("LIT_NETWORK", "nagaDev"),
    /** Chipotle REST API usage key — from dashboard.chipotle.litprotocol.com */
    chipotleApiKey: optional("LIT_CHIPOTLE_API_KEY", ""),
    /** PKP wallet_id created via POST /core/v1/create_wallet */
    chipotlePkpId: optional("LIT_CHIPOTLE_PKP_ID", ""),
  },
  axl: {
    /** URL of the local AXL HTTP bridge. Defaults to the AXL standard port. */
    bridgeUrl: optional("AXL_BRIDGE_URL", "http://localhost:9002"),
    /** Set to "true" to auto-start the AXL binary on backend boot. */
    autoStart: optional("AXL_AUTO_START", "false") === "true",
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
  if (parts.length === 0) return "http://localhost:3000";
  if (parts.length === 1) return parts[0]!;
  return parts;
}
