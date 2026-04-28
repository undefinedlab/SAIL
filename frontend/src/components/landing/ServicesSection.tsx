import React from "react";
import { ScrollReveal } from "./ScrollReveal";

const PIPELINE = [
  {
    n: "01",
    title: "What data the agent received",
    desc: "Inputs are hashed before reasoning begins, creating a verifiable record of the exact data the agent saw.",
  },
  {
    n: "02",
    title: "What the agent committed to before acting",
    desc: "The decision is encrypted, pinned, and committed on-chain before execution can proceed.",
  },
  {
    n: "03",
    title: "Whether execution matched that commitment",
    desc: "Execution is contract-gated against the prior commitment, so mismatched or missing stages revert.",
  },
  {
    n: "04",
    title: "Whether the submitted transaction was modified",
    desc: "Transaction bytes are committed before submission, making any in-transit substitution detectable.",
  },
];

export function ServicesSection() {
  return (
    <section id="pipeline" className="bg-[#f5f5f0] py-[120px] md:py-[160px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <h2 className="text-[clamp(30px,4.5vw,56px)] font-black leading-none tracking-[-0.02em] text-[#05058a]">
            Prove any AI agent on-chain execution
          </h2>
        </ScrollReveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-2 lg:gap-10">
          {PIPELINE.map((s, i) => (
            <ScrollReveal key={s.n} delayMs={i * 50}>
              <article className="group pt-6 transition-colors duration-300 ease-in-out">
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
