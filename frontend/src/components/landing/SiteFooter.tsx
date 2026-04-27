import Link from "next/link";

const FOOTER_LINKS = [
  { href: "#pipeline", label: "Pipeline" },
  { href: "#usecases", label: "Use cases" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export function SiteFooter() {
  return (
    <footer data-oci-cursor="on-dark" className="bg-[#030350] py-16 text-white">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-12 md:grid-cols-3 md:gap-8">
          <div>
            <p className="max-w-xs text-sm font-light leading-relaxed text-white/60">
              Commit · attest · execute · deliver
            </p>
          </div>

          <nav className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center md:justify-center">
            {FOOTER_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[11px] uppercase tracking-[0.2em] text-white/55 transition-colors duration-300 ease-in-out hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-4 md:items-end">
            <div className="flex gap-6 text-[11px] uppercase tracking-[0.2em] text-white/55">
              <a
                href="https://github.com"
                className="transition-colors duration-300 ease-in-out hover:text-white"
              >
                GitHub
              </a>
              <a href="#" className="transition-colors duration-300 ease-in-out hover:text-white">
                Docs
              </a>
            </div>
          </div>
        </div>

        <div className="mt-14 border-t border-white/35 pt-8">
          <p className="text-center text-[11px] tracking-[0.08em] text-white/35">
            © {new Date().getFullYear()} SAIL — Secure Enclave Agent Layer. All rights
            reserved. MIT License.
          </p>
        </div>
      </div>
    </footer>
  );
}
