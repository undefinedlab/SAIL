import { ScrollReveal } from "./ScrollReveal";

export function AboutStatsSection() {
  return (
    <section id="about" className="bg-[#f5f5f0] py-[120px] md:py-[160px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-start">
          <ScrollReveal>
            <p className="text-[clamp(56px,7.5vw,96px)] font-black leading-[0.92] tracking-[-0.03em] text-[#05058a]">
              Anywhere.
              <span className="block">Anytime.</span>
            </p>
          </ScrollReveal>

          <div className="grid gap-6 sm:grid-cols-2">
            {[
              {
                title: "Anywhere",
                desc: "From DAO ops to market-making bots, SAIL follows value everywhere agents act.",
              },
              {
                title: "Anytime",
                desc: "When the stakes spike, verify the full trail without exposing strategy in real time.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} delayMs={60 + i * 40}>
                <div className="border-t border-[#2020e8]/20 pt-5">
                  <p className="text-xs font-semibold tracking-[-0.01em] text-[#05058a]">
                    {item.title}
                  </p>
                  <p className="mt-3 text-sm font-light leading-relaxed text-neutral-600">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
