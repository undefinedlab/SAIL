"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ConnectButtonNoSSR } from "@/components/wallet/ConnectButtonNoSSR";

function useScrolledPast(px: number): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const onScroll = () => onChange();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    },
    () => window.scrollY > px,
    () => false,
  );
}

export function Navbar() {
  const solid = useScrolledPast(48);

  return (
    <header
      data-oci-cursor={solid ? "on-dark" : "on-light"}
      className={`fixed left-0 right-0 top-0 z-[100] transition-colors duration-300 ease-in-out ${
        solid ? "bg-[#05058a]" : "bg-transparent"
      }`}
    >
      <div className="relative mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-5">
        <Link
          href="/#top"
          className={`flex min-w-0 items-center gap-3 transition-colors duration-300 ease-in-out ${
            solid ? "text-white" : "text-[#05058a]"
          }`}
        >
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.22em]">
            Secure Agentic Intelligence Layer
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden md:block">
            <ConnectButtonNoSSR chainStatus="icon" showBalance={false} />
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center bg-[#3535f0] px-4 py-2.5 text-[11px] font-normal tracking-[0.08em] text-white transition-opacity duration-300 ease-in-out hover:opacity-90"
          >
            console
          </Link>
        </div>
      </div>
    </header>
  );
}
