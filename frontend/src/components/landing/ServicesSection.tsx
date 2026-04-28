import { ScrollReveal } from "./ScrollReveal";

const PIPELINE = [
  {
    n: "01",
    title: "Attest inputs",
    desc: "Hash all inputs before reasoning begins — prove exactly what the agent received.",
  },
  {
    n: "02",
    title: "Reason",
    desc: "Any framework, any model. SAIL does not observe or constrain reasoning.",
  },
  {
    n: "03",
    title: "Commit",
    desc: "Encrypt the commitment, pin it to permanent storage, then post hash + CID + nonce on-chain.",
  },
  {
    n: "04",
    title: "Execute",
    desc: "The contract gates execution on a valid prior commitment. Any missing stage reverts.",
  },
  {
    n: "05",
    title: "Deliver",
    desc: "Transaction bytes are committed before submission so any substitution in transit is detectable.",
  },
  {
    n: "06",
    title: "Audit (on request)",
    desc: "Authorized auditors decrypt the blob and verify SHA256(plaintext) matches the on-chain commitment hash.",
  },
];

export function ServicesSection() {
  return (
    <section id="pipeline" className="bg-[#f5f5f0] py-[120px] md:py-[160px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <h2 className="text-[clamp(40px,6vw,80px)] font-black leading-none tracking-[-0.02em] text-[#05058a]">
            The pipeline
          </h2>
        </ScrollReveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {PIPELINE.map((s, i) => (
            <ScrollReveal key={s.n} delayMs={i * 50}>
              <article className="group border-t border-[#2020e8] pt-6 transition-colors duration-300 ease-in-out hover:border-[#3535f0]">
                <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                  {s.n}
                </p>
                <h3 className="mt-4 text-2xl font-bold tracking-[-0.02em] text-[#05058a]">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm font-light leading-relaxed text-neutral-600">
                  {s.desc}
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
