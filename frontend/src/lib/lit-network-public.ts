import type { LitNetworkModule } from "@lit-protocol/networks";
import {
  naga,
  nagaDev,
  nagaLocal,
  nagaMainnet,
  nagaProto,
  nagaStaging,
  nagaTest,
} from "@lit-protocol/networks";

const BY_NORMALIZED_ID: Record<string, LitNetworkModule> = {
  naga,
  nagadev: nagaDev,
  nagatest: nagaTest,
  nagastaging: nagaStaging,
  nagalocal: nagaLocal,
  nagamainnet: nagaMainnet,
  nagaproto: nagaProto,
};

function normalizeLitNetworkId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-_\s]/g, "");
}

/**
 * Browser Lit network — must match backend `LIT_NETWORK` / `resolveLitNetwork()`.
 * Set `NEXT_PUBLIC_LIT_NETWORK` (e.g. `nagaDev`) in `.env.local`.
 */
export function resolveLitNetworkModule(): LitNetworkModule {
  const env = process.env.NEXT_PUBLIC_LIT_NETWORK;
  const key = normalizeLitNetworkId(env ?? "nagaDev");
  const mod = BY_NORMALIZED_ID[key];
  if (!mod) {
    throw new Error(
      `Unknown NEXT_PUBLIC_LIT_NETWORK="${env ?? ""}". Use one of: naga, nagaDev, nagaTest, nagaStaging, nagaLocal, nagaMainnet, nagaProto`,
    );
  }
  return mod;
}
