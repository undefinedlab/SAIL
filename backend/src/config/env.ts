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
    network: optional("LIT_NETWORK", "datil-test"),
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
} as const;

export type Env = typeof env;
