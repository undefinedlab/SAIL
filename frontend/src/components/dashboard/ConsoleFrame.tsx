import type { ReactNode } from "react";

type ConsoleFrameProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
  /** Right side of the default hero row (e.g. tab buttons). Ignored if `aside` is set. */
  headerTrailing?: ReactNode;
  /** Plain header + content: no outer card, border, or tinted hero strip. */
  variant?: "default" | "minimal";
};

export function ConsoleFrame({
  eyebrow,
  title,
  description,
  children,
  aside,
  headerTrailing,
  variant = "default",
}: ConsoleFrameProps) {
  if (variant === "minimal") {
    return (
      <section className="space-y-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/60">
            {eyebrow}
          </p>
          <h1 className="mt-3 max-w-4xl text-[clamp(34px,5vw,66px)] font-black leading-[0.92] tracking-[-0.04em] text-[#05058a]">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#05058a]/72">{description}</p>
          ) : null}
        </div>
        <div>{children}</div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="overflow-hidden border border-[#05058a]/15 bg-white">
        <div
          className={`grid gap-8 border-b border-[#05058a]/10 bg-[linear-gradient(135deg,rgba(5,5,138,0.05),rgba(32,32,232,0.12))] px-6 py-7 md:px-8 ${
            aside
              ? "md:grid-cols-[minmax(0,1fr)_280px]"
              : headerTrailing
                ? "md:grid-cols-[minmax(0,1fr)_auto]"
                : ""
          }`}
        >
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/60">
              {eyebrow}
            </p>
            <h1 className="mt-3 max-w-4xl text-[clamp(34px,5vw,66px)] font-black leading-[0.92] tracking-[-0.04em] text-[#05058a]">
              {title}
            </h1>
            {description ? (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#05058a]/72">{description}</p>
            ) : null}
          </div>

          {aside ? (
            <div className="space-y-3 border border-[#05058a]/10 bg-white/80 p-4 backdrop-blur md:mt-0">
              {aside}
            </div>
          ) : headerTrailing ? (
            <div className="flex flex-col justify-end gap-2 md:items-end md:self-end">{headerTrailing}</div>
          ) : null}
        </div>

        <div className="px-6 py-6 md:px-8">{children}</div>
      </div>
    </section>
  );
}
