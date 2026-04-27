"use client";

import { useEffect, useRef } from "react";
import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { ScrollReveal } from "./ScrollReveal";

const USE_CASES = [
  {
    name: "DAO treasury",
    category: "Governance",
    src: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&q=80",
    hover:
      "In DAO treasury automation, it’s hard to prove why a transaction happened before funds move. With SAIL, treasury risk becomes controllable: actions are enforced by policy, and disputes can be investigated without exposing everything by default.",
  },
  {
    name: "Agent-to-agent",
    category: "Coordination",
    src: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=900&q=80",
    hover:
      "In agent-to-agent coordination, there’s no reliable way to know a worker didn’t fabricate an answer. With SAIL, collaboration is safer: risky tasks can be constrained, misbehavior becomes provable, and escalation paths are built in.",
  },
  {
    name: "Regulated deployments",
    category: "Audit",
    src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&q=80",
    hover:
      "In regulated workflows, you need audit evidence without exposing strategy to everyone. With SAIL, you can satisfy audits with a tight trail of evidence, while keeping sensitive logic private unless an authorized review is triggered.",
  },
  {
    name: "Autonomous trading",
    category: "Finance",
    src: "https://images.unsplash.com/photo-1535320903710-d993d3d77d29?w=900&q=80",
    hover:
      "In autonomous trading, proving fairness usually means leaking alpha. With SAIL, you can demonstrate integrity after the fact without giving away live strategy, and contain fallout when a trade is questioned.",
  },
  {
    name: "Credential-proof workflows",
    category: "Access",
    src: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=900&q=80",
    hover:
      "In credential-proof access flows, approvals often boil down to trust and screenshots. With SAIL, approvals become enforceable and auditable: decisions can be reviewed with evidence, without leaking private credentials.",
  },
];

export function ProjectsSection() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;

      const delta = e.deltaY + e.deltaX;
      if (delta === 0) return;

      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= maxScroll - 0.5;

      if (delta < 0 && atStart) return;
      if (delta > 0 && atEnd) return;

      e.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(maxScroll, el.scrollLeft + delta));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <section id="usecases" className="bg-[#f5f5f0] py-[120px] md:py-[160px]">
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <h2 className="text-[clamp(40px,6vw,80px)] font-black leading-none tracking-[-0.02em] text-[#05058a]">
            Use cases
          </h2>
        </ScrollReveal>

        <div
          ref={scrollerRef}
          className="mt-12 flex gap-6 overflow-x-auto overscroll-x-contain pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {USE_CASES.map((p, i) => (
            <ScrollReveal
              key={p.name}
              delayMs={i * 60}
              className="min-w-[min(85vw,420px)] shrink-0"
            >
              <article
                data-oci-cursor="on-dark"
                className="group relative aspect-[4/5] w-full overflow-hidden bg-[#0808b0]"
              >
                <BayerDitherImage
                  src={p.src}
                  alt={p.name}
                  className="absolute inset-0 h-full w-full origin-center transition-transform duration-300 ease-in-out group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-[#040482]/0 mix-blend-multiply transition-colors duration-300 ease-in-out group-hover:bg-[#040482]/45" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-7 text-center opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                  <p className="max-w-[28ch] text-balance text-sm font-medium leading-snug text-white">
                    {p.hover}
                  </p>
                </div>
                <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/80">
                    {p.category}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.02em]">{p.name}</p>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
