import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    injected({
      target: "metaMask",
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
