"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

const nav = [
  { href: "#pipeline", label: "Pipeline" },
  { href: "#architecture", label: "Architecture" },
  { href: "#reveal", label: "Reveal" },
  { href: "#sponsors", label: "Integrations" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-sm">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-2 sm:px-4">
        <a href="#" className="sail-badge">
          <span className="text-xs">◎</span>
          SAIL CONSULTANTS INC.
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ConnectButton chainStatus="icon" showBalance={false} />
          <a href="/dashboard" className="sail-badge !px-3 !py-2 !tracking-normal">
            Dashboard
          </a>
        </div>
      </div>
    </header>
  );
}
