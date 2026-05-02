"use client";

import { ConnectButtonNoSSR } from "@/components/wallet/ConnectButtonNoSSR";

/** Minimal wallet control — no full navbar */
export function WalletCorner() {
  return (
    <div className="fixed right-4 top-4 z-[60] flex items-center gap-2">
      <ConnectButtonNoSSR chainStatus="icon" showBalance={false} />
    </div>
  );
}
