const gaps = [
  {
    title: "Poisoned inputs",
    body:
      "No standard for proving what data an agent saw before reasoning. Tamper inputs and correct logic on top is meaningless.",
  },
  {
    title: "Opacity",
    body:
      "No proof of what an agent decided before execution — a bot can bypass logic and call contracts directly.",
  },
  {
    title: "Execution drift",
    body:
      "Reasoning may be verified, but a compromised runtime can still act differently from what it reasoned.",
  },
  {
    title: "Delivery risk",
    body:
      "Signed txs pass through relayers; drops, delays, or substitution break accountability at the last step.",
  },
  {
    title: "Publicity",
    body:
      "Public audit trails leak strategy. Accountability and privacy look fundamentally at odds.",
  },
];

export function ProblemSection() {
  return (
    <section className="border-b border-[var(--border)] bg-[var(--surface-alt)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="sail-section-label">The problem</p>
        <h2 className="font-display mt-4 max-w-3xl text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem]">
          Trust-me infrastructure for agentic economies
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
          Autonomous agents manage treasuries, trades, and coordination on-chain — yet infrastructure fails across
          five dimensions at once.
        </p>
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {gaps.map((g) => (
            <li
              key={g.title}
              className="flex flex-col border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm shadow-stone-900/5"
            >
              <h3 className="font-display text-xl font-medium text-stone-900">{g.title}</h3>
              <div className="sail-divider my-4 w-12" />
              <p className="text-sm leading-relaxed text-[var(--muted)]">{g.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
