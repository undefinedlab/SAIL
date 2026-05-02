"use client";

import dynamic from "next/dynamic";

/**
 * RainbowKit's ConnectButton reads wallet state that only exists in the browser; SSR HTML
 * often does not match the first client render → hydration warnings. Disable SSR for this subtree.
 */
export const ConnectButtonNoSSR = dynamic(
  () => import("@rainbow-me/rainbowkit").then((m) => m.ConnectButton),
  { ssr: false },
);
