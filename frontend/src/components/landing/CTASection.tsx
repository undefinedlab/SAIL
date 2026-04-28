"use client";

import { ScrollReveal } from "./ScrollReveal";

export function CTASection() {
  return (
    <section
      id="contact"
      data-oci-cursor="on-light"
      className="bg-[#f5f5f0] py-[120px] md:py-[160px]"
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <div className="mx-auto max-w-[980px] text-center">
            <h2 className="text-[clamp(40px,6vw,80px)] font-black leading-none tracking-[-0.02em] text-[#05058a]">
              Add SAIL to your flow
            </h2>
            <p className="mx-auto mt-6 max-w-[60ch] text-sm font-light text-[#05058a]/75">
              Plug SAIL into your existing agent stack and keep every high-stakes action accountable,
              auditable, and verifiable.
            </p>

            <div className="mt-10 text-left">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[#05058a]/70">
                Ready integrations
              </p>
              <p className="mt-2 text-center text-sm font-light text-[#05058a]/65">
                Works cleanly with your current tools and orchestration flow.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    name: "Cursor",
                    desc: "Bring SAIL checks directly into local agent workflows.",
                  },
                  {
                    name: "Claude",
                    desc: "Use SAIL accountability in assistant-driven execution loops.",
                  },
                  {
                    name: "LangChain",
                    desc: "Attach SAIL to chain steps where state changes are critical.",
                  },
                  {
                    name: "CrewAI",
                    desc: "Coordinate multi-agent tasks with verifiable execution trails.",
                  },
                ].map((item) => (
                  <article
                    key={item.name}
                    className="border border-[#05058a]/15 bg-white px-5 py-6 text-left"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#05058a]/70">
                      Integration
                    </p>
                    <p className="mt-3 text-xl font-black tracking-[-0.02em] text-[#05058a]">
                      {item.name}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-[#05058a]/70">
                      {item.desc}
                    </p>
                  </article>
                ))}
              </div>

              <p className="mt-8 text-center text-[12px] font-medium uppercase tracking-[0.16em] text-[#05058a]/65">
                Keep your flow. Add accountability.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
