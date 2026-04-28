import { ScrollReveal } from "./ScrollReveal";

export function ManifestoSection() {
  return (
    <section className="bg-[#f5f5f0] py-[84px] md:py-[104px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-10 md:grid-cols-12 md:gap-16 lg:gap-20">
          <div className="md:col-span-7">
            <div className="grid gap-8 md:gap-10">
              <ScrollReveal delayMs={80}>
                <p className="text-[15px] font-light leading-[1.9] text-neutral-700 sm:text-base">
                  SAIL is a cryptographic accountability layer for AI agents operating on-chain. For any high-stakes
                  action — a treasury transfer, a DAO execution, a regulated trade — it produces an on-chain receipt
                  that binds what the agent received, what it committed to, and what it executed.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={160}>
                <p className="text-[15px] font-light leading-[1.9] text-neutral-700 sm:text-base">
                  Agents are black boxes. SAIL makes that box auditable.
                </p>
              </ScrollReveal>
            </div>
          </div>

          <div className="md:col-span-5 md:flex md:justify-end">
            <ScrollReveal>
              <p className="text-left text-[clamp(22px,2.2vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em] text-[#05058a]">
                Reason privately, commit publicly, reveal selectively.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
