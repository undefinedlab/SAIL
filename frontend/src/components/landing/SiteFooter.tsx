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
    <footer data-oci-cursor="on-dark" className="bg-[#2020e8] py-16 text-white">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-12 md:grid-cols-4 md:justify-items-center md:gap-8">
          {FOOTER_COLUMNS.map((col) => (
            <nav
              key={col.title}
              aria-label={col.title}
              className="grid justify-items-start gap-4 text-left md:justify-items-center md:text-center"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">
                {col.title}
              </p>
              <div className="grid gap-3 md:justify-items-center">
                {col.links.map((l) =>
                  "external" in l && l.external ? (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] uppercase tracking-[0.2em] text-white/55 transition-colors duration-300 ease-in-out hover:text-white"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.label}
                      href={l.href}
                      className="text-[11px] uppercase tracking-[0.2em] text-white/55 transition-colors duration-300 ease-in-out hover:text-white"
                    >
                      {l.label}
                    </Link>
                  )
                )}
              </div>
            </nav>
          ))}
        </div>

        <div className="mt-14 pt-8">
          <p className="text-center text-[11px] tracking-[0.08em] text-white/35">
            © {new Date().getFullYear()} Secure Agentic Intelligence Layer. All rights
            reserved. MIT License.
          </p>
        </div>
      </div>
    </footer>
  );
}
