import { ScrollReveal } from "./ScrollReveal";

export function ManifestIntroSection() {
  return (
    <section className="bg-[#f5f5f0] py-[68px] md:py-[84px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal delayMs={80}>
          <div className="max-w-[78ch]">
            <p className="text-[15px] font-light leading-[1.9] text-neutral-700 sm:text-base">
              SAIL is a cryptographic accountability layer for AI agents operating on-chain. For any actions, and any agents, it produces an on-chain receipt that binds what the agent received, what it committed to, and what it executed.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
