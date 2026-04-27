"use client";

import { useEffect, useState } from "react";

type CursorScheme = "on-dark" | "on-light";

export function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [scheme, setScheme] = useState<CursorScheme>("on-light");

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const onDark =
        el != null && el.closest("[data-oci-cursor='on-dark']") != null;
      setScheme(onDark ? "on-dark" : "on-light");
    };
    const onLeave = () => setVisible(false);
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  if (!visible) return null;

  const isDark = scheme === "on-dark";

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[200]"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      aria-hidden
    >
      <div className="relative flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <div
          className={
            isDark
              ? "absolute inset-0 border border-white/90"
              : "absolute inset-0 border border-[#05058a]/90"
          }
        />
        <div
          className={
            isDark ? "relative h-1.5 w-1.5 bg-white" : "relative h-1.5 w-1.5 bg-[#05058a]"
          }
        />
      </div>
    </div>
  );
}
