import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { localhost, sepolia } from "wagmi/chains";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
export const walletConnectEnabled = Boolean(walletConnectProjectId);

const useLocalFirst = process.env.NEXT_PUBLIC_USE_LOCAL_CHAIN === "true";

/** Ethereum Sepolia (chain id 11155111), not Base Sepolia. */
export const expectedChain = useLocalFirst ? localhost : sepolia;

export const wagmiConfig = createConfig({
  ssr: true,
  chains: useLocalFirst ? [localhost, sepolia] : [sepolia, localhost],
  connectors: walletConnectProjectId
    ? [
        injected(),
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
        }),
      ]
    : [injected()],
  transports: {
    [localhost.id]: http(process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545"),
    [sepolia.id]: http(
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"
    ),
  },
});

export const sealContractAddress = (process.env.NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS ??
  "0x") as `0x${string}`;

/**
 * Backend base URL for `fetch`. If unset, use same-origin paths (`/api/...`, `/health`) so Next.js
 * rewrites (see `next.config.ts`) can proxy to the real API — default proxy target matches backend PORT (3001).
 * Set `NEXT_PUBLIC_SEAL_API_URL` only when you need a direct absolute URL (e.g. API on another host).
 */
export const sealApiBase = (
  process.env.NEXT_PUBLIC_SEAL_API_URL?.replace(/\/$/, "") ?? ""
).trim();

/** Human-readable label for UI when `sealApiBase` is empty (same-origin proxy). */
export const sealApiLabel = sealApiBase || "same origin (Next.js → SEAL_API_PROXY_TARGET)";
