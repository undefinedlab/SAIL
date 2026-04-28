import React from "react";
import Link from "next/link";

const FOOTER_COLUMNS = [
  {
    title: "About us",
    links: [
      { href: "#manifesto", label: "Manifesto" },
      { href: "#contact", label: "Contact" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/mcp", label: "MCP" },
      { href: "#", label: "Docs" },
    ],
  },
  {
    title: "MCP flow",
    links: [
      { href: "/mcp", label: "Start flow" },
      { href: "#pipeline", label: "Pipeline" },
    ],
  },
  {
    title: "Legals",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "https://twitter.com", label: "Twitter", external: true },
      { href: "https://linkedin.com", label: "LinkedIn", external: true },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-[#f5f5f0] py-16 text-[#05058a]">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-12 md:grid-cols-5 md:gap-8">
          {FOOTER_COLUMNS.map((col) => (
            <nav
              key={col.title}
              aria-label={col.title}
              className="grid justify-items-start gap-4 text-left"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#05058a]/80">
                {col.title}
              </p>
              <div className="grid gap-3">
                {col.links.map((l) =>
                  "external" in l && l.external ? (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] uppercase tracking-[0.2em] text-neutral-600 transition-colors duration-300 ease-in-out hover:text-[#05058a]"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.label}
                      href={l.href}
                      className="text-[11px] uppercase tracking-[0.2em] text-neutral-600 transition-colors duration-300 ease-in-out hover:text-[#05058a]"
                    >
                      {l.label}
                    </Link>
                  )
                )}
              </div>
            </nav>
          ))}
        </div>

        <div className="mt-14 border-t border-[#2020e8]/10 pt-8">
          <p className="text-center text-[11px] tracking-[0.08em] text-neutral-500">
            © {new Date().getFullYear()} Secure Agentic Intelligence Layer. All rights
            reserved. MIT License.
          </p>
        </div>
      </div>
    </footer>
  );
}
