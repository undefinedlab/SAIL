"use client";

import { FormEvent, useState } from "react";
import { ScrollReveal } from "./ScrollReveal";

export function CTASection() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <section
      id="contact"
      data-oci-cursor="on-dark"
      className="bg-[#2020e8] py-[120px] md:py-[160px]"
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <div className="mx-auto max-w-[720px] text-center">
            <h2 className="text-[clamp(40px,6vw,80px)] font-black leading-none tracking-[-0.02em] text-white">
              Ready to sail the loop?
            </h2>
            <p className="mt-6 text-sm font-light text-white/80">
              Get updates on the demo, testnet, and integrations.
            </p>

            <form
              onSubmit={onSubmit}
              className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-center"
            >
              <label htmlFor="sail-email" className="sr-only">
                Email
              </label>
              <input
                id="sail-email"
                name="email"
                type="email"
                required
                placeholder="you@build.xyz"
                className="min-h-[52px] flex-1 border border-white/20 bg-white/10 px-4 text-white placeholder:text-white/50 focus:border-white focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[52px] bg-white px-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#05058a] transition-opacity duration-300 ease-in-out hover:opacity-90"
              >
                Notify me
              </button>
            </form>
            {sent ? (
              <p className="mt-4 text-sm text-white/80" role="status">
                Thanks — you&apos;re on the list.
              </p>
            ) : null}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
