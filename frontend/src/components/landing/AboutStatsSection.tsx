import { ScrollReveal } from "./ScrollReveal";

const WORKFLOWS = [
  "Cursor",
  "Codex",
  "Claude",
  "LangChain",
  "CrewAI",
  "AutoGen",
  "OpenAI Agents SDK",
  "ElizaOS",
  "Semantic Kernel",
  "LlamaIndex",
  "Haystack",
  "Mastra",
  "OpenHands",
  "n8n Agents",
];

export function AboutStatsSection() {
  return (
    <section id="about" className="bg-[#f5f5f0] py-[120px] md:py-[160px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-start">
          <div>
            <ScrollReveal>
              <p className="text-[clamp(56px,7.5vw,96px)] font-black leading-[0.92] tracking-[-0.03em] text-[#05058a]">
                Anywhere.
                <span className="block">Anytime.</span>
              </p>
            </ScrollReveal>
          </div>

          <div className="grid gap-8">
            <ScrollReveal delayMs={150}>
              <div className="overflow-hidden rounded-2xl bg-[#05058a] px-5 py-6 md:px-6 md:py-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">
                  Works with every single or multi-agent orchestration.
                </p>

                <div className="mt-5 grid gap-3">
                  <div className="overflow-hidden">
                    <div className="workflow-marquee workflow-marquee--left flex w-max gap-2">
                      {[...WORKFLOWS, ...WORKFLOWS].map((name, idx) => (
                        <span
                          key={`left-${name}-${idx}`}
                          className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-white/95 backdrop-blur-[2px]"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-hidden">
                    <div className="workflow-marquee workflow-marquee--right flex w-max gap-2">
                      {[...WORKFLOWS.slice().reverse(), ...WORKFLOWS.slice().reverse()].map((name, idx) => (
                        <span
                          key={`right-${name}-${idx}`}
                          className="rounded-full border border-white/20 bg-[#7777ff]/25 px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-white/95"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
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
                <ScrollReveal key={item.title} delayMs={210 + i * 40}>
                  <div className="pt-1">
                    <p className="text-xs font-semibold tracking-[-0.01em] text-[#05058a]">{item.title}</p>
                    <p className="mt-3 text-sm font-light leading-relaxed text-neutral-600">{item.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
