export function SiteFooter() {
  return (
    <footer className="bg-[var(--surface-alt)] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 border-t border-[var(--border-strong)] pt-12 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="sail-badge w-fit">SAIL INC.</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Secure Agentic Infrastructure Layer — confidential, verifiable execution infrastructure for AI agents
              operating on-chain.
            </p>
          </div>
          <div>
            <p className="sail-section-label">Disclosure</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Production uses AWS Nitro Enclaves or Intel TDX. Hackathon demo may use a mock attestation signer
              that emits correctly structured quotes — disclosed transparently; architecture remains valid.
            </p>
          </div>
          <div>
            <p className="sail-section-label">Stay in touch</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              build for the EthGlobals
            </p>
          </div>
        </div>
        <p className="mt-12 text-center text-xs uppercase tracking-[0.16em] text-[var(--muted-light)]">
          SAIL
        </p>
      </div>
    </footer>
  );
}
