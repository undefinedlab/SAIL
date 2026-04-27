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
    <header className="sail-header">
      <div className="sail-shell sail-header-inner">
        <a href="#" className="sail-badge">
          <span>◎</span>
          SAIL
        </a>
        <nav className="sail-nav">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="sail-nav-link">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sail-header-actions">
          <ConnectButton chainStatus="icon" showBalance={false} />
          <a href="#reveal" className="sail-ghost-btn">
            Explore demo
          </a>
        </div>
      </div>
    </header>
  );
}
