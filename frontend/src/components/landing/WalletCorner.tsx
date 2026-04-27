"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/** Minimal wallet control — no full navbar */
export function WalletCorner() {
  return (
    <div className="fixed right-4 top-4 z-[60] flex items-center gap-2">
      <ConnectButton chainStatus="icon" showBalance={false} />
    </div>
  );
}
