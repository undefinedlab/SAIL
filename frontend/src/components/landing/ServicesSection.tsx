import { ScrollReveal } from "./ScrollReveal";

const PIPELINE = [
  {
    n: "01",
    title: "Attest inputs",
    desc: "Hash on-chain state and external data before reasoning — prove what the agent saw.",
  },
  {
    n: "02",
    title: "Reason in TEE",
    desc: "LLM inference inside Nitro / TDX; reasoning never leaves the enclave in plaintext.",
  },
  {
    n: "03",
    title: "Commit + attest",
    desc: "Merkle-batched commitment on-chain with TEE quote — ordering is tamper-evident.",
  },
  {
    n: "04",
    title: "Execute in TEE",
    desc: "Contract gates execution on a valid prior commitment; action bound to reasoning.",
  },
  {
    n: "05",
    title: "Guaranteed delivery",
    desc: "Tx bytes committed before submission — relayer substitution is detectable.",
  },
  {
    n: "06",
    title: "Selective reveal",
    desc: "Encrypted blobs on Filecoin; Lit controls who can decrypt and verify the chain.",
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
