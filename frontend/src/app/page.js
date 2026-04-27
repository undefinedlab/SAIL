"use client";

import styles from "./page.module.css";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error, isPending, status } = useConnect();
  const { disconnect } = useDisconnect();

  const metaMaskConnector = connectors.find(
    (connector) =>
      connector.id === "metaMask" || connector.name.toLowerCase().includes("metamask"),
  );

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>SEEL Web3 Frontend</h1>
        <p className={styles.subtitle}>
          Connect your MetaMask wallet to verify Web3 integration.
        </p>

        {!isConnected ? (
          <button
            type="button"
            className={styles.primary}
            disabled={!metaMaskConnector || isPending}
            onClick={() => connect({ connector: metaMaskConnector })}
          >
            {isPending ? "Connecting..." : "Connect MetaMask"}
          </button>
        ) : (
          <div className={styles.walletCard}>
            <p className={styles.label}>Connected address</p>
            <p className={styles.address}>{address}</p>
            <button type="button" className={styles.secondary} onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        )}

        {status === "error" && <p className={styles.error}>{error?.message || "Connection failed."}</p>}
      </main>
    </div>
  );
}
