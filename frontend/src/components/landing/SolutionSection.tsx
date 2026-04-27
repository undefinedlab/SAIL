export function SolutionSection() {
  return (
    <section className="border-b border-[var(--border)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="sail-section-label">The solution</p>
        <h2 className="font-display mt-4 max-w-3xl text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem]">
          Commit · attest · execute — infrastructure, not a single product
        </h2>
        <div className="mt-8 max-w-3xl space-y-5 text-lg leading-relaxed text-[var(--muted)]">
          <p>
            SAIL is the{" "}
            <strong className="font-semibold text-stone-900">commit-attest-execute layer</strong> for AI agents.
            What gets committed on-chain is separated from what gets revealed and to whom — accountability and
            privacy together.
          </p>
          <p>
            The agent reasons inside a confidential enclave. A cryptographic commitment lands on-chain before
            execution. Reasoning stays private — authorized parties can request a verified reveal.
          </p>
          <p className="border border-[var(--border-strong)] bg-[var(--surface-alt)] px-5 py-4 text-base text-stone-800">
            One primitive: marketplaces, DAOs, trading desks, hiring pipelines, regulated decision systems — any
            system running agents can plug in SAIL as the trust layer underneath.
          </p>
        </div>
      </div>
    </section>
  );
}
