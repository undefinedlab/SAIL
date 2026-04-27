const stages = [
  {
    n: "01",
    title: "Attest inputs",
    body:
      "On-chain state and external data is hashed before entering the TEE — proves what the agent was looking at, not only what it decided.",
  },
  {
    n: "02",
    title: "Reason in TEE",
    body:
      "LLM runs inside a TEE (e.g. AWS Nitro / Intel TDX). Reasoning never leaves the enclave in plaintext.",
  },
  {
    n: "03",
    title: "Commit + attest",
    body:
      "Merkle-batched hash of the reasoning blob on-chain with TEE attestation and sequence nonce — commitment provably precedes execution.",
  },
  {
    n: "04",
    title: "Execute in TEE",
    body:
      "Execution in the same TEE; action hashed into attestation — proves consistency with reasoning.",
  },
  {
    n: "05",
    title: "Guaranteed delivery",
    body:
      "Submit from the TEE where possible; otherwise exact tx bytes committed on-chain before relayer submission — deviation is detectable.",
  },
  {
    n: "06",
    title: "Selective reveal",
    body:
      "Encrypted blobs on Filecoin / Storacha; Lit controls access so stakers, regulators, or auditors decrypt and verify the full chain.",
  },
];

export function PipelineSection() {
  return (
    <section id="pipeline" className="scroll-mt-16 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="sail-section-label">Pipeline</p>
        <h2 className="font-display mt-4 max-w-3xl text-6xl font-semibold leading-[0.95] tracking-tight text-[var(--foreground)] sm:text-7xl">
          Here at every step
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
          Every agent action follows this contract-enforced pipeline — from attested inputs through selective
          reveal.
        </p>
        <div className="mt-14 grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-3">
          {stages.map((s) => (
            <div
              key={s.n}
              className="flex flex-col border border-[var(--border-strong)] bg-[#ecece8] p-5"
              style={{ transform: s.n === "02" ? "rotate(1.5deg)" : s.n === "03" ? "rotate(-1.5deg)" : "none" }}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-4xl font-medium text-[var(--foreground)]">{s.title}</h3>
                <span className="mt-2 font-sans text-4xl tabular-nums text-[var(--foreground)]">{s.n}</span>
              </div>
              <div className="sail-divider my-5 w-full max-w-[3rem]" />
              <p className="text-sm leading-relaxed text-[var(--muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
