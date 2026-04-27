import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { ScrollReveal } from "./ScrollReveal";

const VISUAL_SRC =
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=900&q=80";

export function AboutStatsSection() {
  return (
    <section
      id="about"
      data-oci-cursor="on-dark"
      className="bg-[#05058a] py-[120px] text-white md:py-[160px]"
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center">
          <ScrollReveal>
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#0808b0]">
              <BayerDitherImage
                src={VISUAL_SRC}
                alt="Trusted execution and infrastructure"
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </ScrollReveal>

          <div>
            <div className="grid gap-10 lg:gap-12">
              <ScrollReveal>
                <div>
                  <p className="text-[clamp(56px,7.5vw,96px)] font-black leading-[0.92] tracking-[-0.03em]">
                    Anywhere.
                    <span className="block">Anytime.</span>
                  </p>
                </div>
              </ScrollReveal>

              <div className="grid gap-6 sm:grid-cols-2">
                {[
                  {
                    title: "Anywhere",
                    desc: "DAOs, marketplaces, desks, and workflows — wherever agents touch value.",
                  },
                  {
                    title: "Anytime",
                    desc: "When stakes are high: adversarial markets, regulated flows, or automated ops.",
                  },
                  {
                    title: "On-chain + off-chain",
                    desc: "Works with contracts, relayers, and real systems — not just demos.",
                  },
                  {
                    title: "Privacy-first",
                    desc: "Share evidence when needed, not all the time.",
                  },
                ].map((item, i) => (
                  <ScrollReveal key={item.title} delayMs={60 + i * 40}>
                    <div className="border-t border-white/25 pt-5">
                      <p className="text-xs font-semibold tracking-[-0.01em] text-white">
                        {item.title}
                      </p>
                      <p className="mt-3 text-sm font-light leading-relaxed text-white/80">
                        {item.desc}
                      </p>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>

            <ScrollReveal delayMs={120} className="mt-12">
              <p className="text-base font-light leading-[1.8] text-white/85">
                Use SAIL wherever an agent can cause real-world impact: moving funds, changing state, approving access,
                signing, or triggering irreversible actions.
                <span className="block mt-4 text-white/75">
                  Use it when you need verifiability and controlled execution: prove what happened after the fact, and
                  ensure actions follow the agent’s decision path — without leaking strategy in real time. Ideal for
                  regulated flows, high-stakes automation, adversarial markets, and agent marketplaces.
                </span>
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
