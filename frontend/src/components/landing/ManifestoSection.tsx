import React from "react";
import { ScrollReveal } from "./ScrollReveal";

const PIPELINE = [
  "Attest inputs: hash all inputs before reasoning begins.",
  "Reason: agent runs with any model or framework.",
  "Commit: encrypt, pin, and post commitment hash on-chain.",
  "Execute: contract gates execution against the prior commit.",
  "Deliver: commit transaction bytes before submission.",
  "Audit: authorized reveal verifies input-commit-execute integrity.",
];

export function ManifestoSection() {
  return (
    <section className="bg-[#f5f5f0] py-[84px] md:py-[104px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <div className="mt-10 md:mt-12">
            <p className="text-[clamp(28px,3.2vw,48px)] font-semibold leading-[1.03] tracking-[-0.02em] text-[#05058a]">
              Reason privately, commit publicly, reveal selectively.
            </p>
            <ul className="mt-6 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {PIPELINE.map((step, idx) => (
                <li
                  key={step}
                  data-oci-cursor="on-dark"
                  className="rounded-xl border border-[#05058a]/35 bg-gradient-to-br from-[#0b0bb8] to-[#05058a] p-5 shadow-[0_8px_20px_rgba(5,5,138,0.18)] transition-transform duration-200 ease-out hover:-translate-y-1"
                >
                  <p className="text-[12px] uppercase tracking-[0.16em] text-white/70">Step {idx + 1}</p>
                  <p className="mt-2 text-[clamp(16px,1.3vw,18px)] font-light leading-relaxed text-white/95">{step}</p>
                </li>
              ))}
            </ul>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
