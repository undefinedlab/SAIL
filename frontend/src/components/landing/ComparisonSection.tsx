const rows = [
  { label: "Traditional DAO bots", v: false, p: null, b: false, a: false },
  { label: "Public IPFS audit logs", v: true, p: false, b: false, a: "~" as const },
  { label: "ZK-only approaches", v: true, p: true, b: false, a: false },
  { label: "SAIL", v: true, p: true, b: true, a: true, highlight: true },
];

function Cell({ ok }: { ok: boolean | "~" }) {
  if (ok === "~") return <span className="text-[var(--muted)]">~</span>;
  return (
    <span className={ok ? "font-medium text-[var(--accent-subtle)]" : "text-[var(--muted-light)]"}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

export function ComparisonSection() {
  return (
    <section className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="sail-section-label">Testimonials</p>
        <h2 className="mt-4 text-6xl font-semibold tracking-tight text-[var(--foreground)] sm:text-7xl">
          Gensler
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <blockquote className="max-w-4xl text-5xl leading-tight text-[var(--foreground)] sm:text-6xl">
              “I have worked with SAIL for many projects. We know every execution is completed on time and fully
              verifiable.”
            </blockquote>
            <p className="mt-8 text-sm uppercase tracking-[0.2em] text-[var(--muted)]">01/03 · T.Hanks, CRO</p>
          </div>
          <div className="border border-[var(--border-strong)] p-4 text-sm">
            <p className="sail-section-label">Capability matrix</p>
            <div className="mt-3 space-y-2 text-[var(--muted)]">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>{row.label}</span>
                  <span className="text-[var(--foreground)]">{row.highlight ? "●" : "○"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
