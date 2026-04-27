"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

export function ScrollReveal({ children, className = "", delayMs }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("oci-reveal-visible");
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delayMs != null ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`translate-y-[30px] opacity-0 transition-all duration-700 ease-out [&.oci-reveal-visible]:translate-y-0 [&.oci-reveal-visible]:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}
