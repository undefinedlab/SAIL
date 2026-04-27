const cases = [
  {
    title: "DAO treasury",
    body:
      "Treasury agent proposes and executes on-chain actions. Stakers verify reasoning and trigger selective reveal on suspicion.",
  },
  {
    title: "Agent-to-agent",
    body:
      "Client agents prove workers reasoned before output; stake slashing if reveal shows fraudulent reasoning.",
  },
  {
    title: "Regulated industries",
    body:
      "Finance, healthcare, legal: auditable trails via Filecoin log — compliance without exposing proprietary strategy.",
  },
  {
    title: "Autonomous trading",
    body:
      "Commit reasoning hashes before each trade; regulators or counterparties investigate post-hoc without live strategy leakage.",
  },
];

export function UseCasesSection() {
  return (
    <section className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="sail-section-label">Projects</p>
        <h2 className="font-display mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-[var(--foreground)] sm:text-6xl">
          Most recent projects
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
          SAIL is domain-agnostic: any system running AI agents gains verifiable reasoning with one integration.
        </p>
        <ul className="mt-14 grid gap-6 md:grid-cols-3">
          {cases.slice(0, 3).map((c, i) => (
            <li
              key={c.title}
              className="border border-[var(--border-strong)] bg-[var(--surface)] p-4"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">0{i + 1}</p>
              <h3 className="mt-2 text-4xl leading-none font-medium text-[var(--foreground)]">{c.title}</h3>
              <div
                className="mt-4 h-52 w-full bg-cover bg-center"
                style={{ backgroundImage: `url('/reference/website_0${i + 4}_f${464 + i * 116}.jpg')` }}
              />
              <div className="sail-divider my-4 w-full" />
              <p className="text-sm leading-relaxed text-[var(--muted)]">{c.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
