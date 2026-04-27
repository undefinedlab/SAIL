import { ScrollReveal } from "./ScrollReveal";

export function ManifestoSection() {
  return (
    <section className="border-y border-neutral-300 bg-[#f5f5f0] py-[84px] md:py-[104px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-10 md:grid-cols-12 md:gap-16 lg:gap-20">
          <div className="md:col-span-7">
            <div className="grid gap-8 md:gap-10">
              <ScrollReveal delayMs={80}>
                <p className="text-[15px] font-light leading-[1.9] text-neutral-700 sm:text-base">
                  Today’s agents can move money, ship code, approve access, and trigger irreversible actions — but their
                  decision-making is mostly opaque. When something goes wrong, you get logs after the fact, unverifiable
                  claims, and no clean way to separate honest mistakes from manipulation.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={160}>
                <p className="text-[15px] font-light leading-[1.9] text-neutral-700 sm:text-base">
                  The missing primitive is accountability without surveillance: prove an agent committed to a decision
                  before acting, keep strategy private by default, and enable verified investigation only when it
                  matters.
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
