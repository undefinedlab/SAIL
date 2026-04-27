import { BayerDitherHero } from "@/components/hero/BayerDitherHero";

export function Hero() {
  return (
    <section className="relative min-h-[88vh] overflow-hidden border-b border-[var(--border)]">
      <BayerDitherHero
        imageSrc="/hero-sail-iceberg.jpg"
        className="absolute inset-0 min-h-[88vh]"
      />
      <div className="pointer-events-none relative z-10 mx-auto flex min-h-[88vh] max-w-7xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-32">
        <p className="sail-section-label !text-[#c8cdff]">PL Genesis · March 2026</p>
        <h1 className="font-display mt-6 max-w-5xl text-[4.2rem] font-semibold leading-[0.95] tracking-tight text-[#f2f4ff] sm:text-[5.2rem] lg:text-[6.3rem]">
          SAIL
          <br />
          Secure Agentic Infrastructure Layer
        </h1>
        <p className="mt-8 max-w-md text-2xl leading-tight text-[#ecefff]">
          Answering all of your agent integrity needs.
        </p>
        <div className="pointer-events-auto mt-12 flex flex-wrap gap-4">
          <a
            href="#reveal"
            className="inline-flex items-center justify-center border border-[#d5d9ff] bg-[#eef0ff] px-8 py-3 text-sm font-semibold text-[var(--accent)] transition-opacity hover:opacity-90"
          >
            View demo
          </a>
          <a
            href="#pipeline"
            className="inline-flex items-center justify-center border border-[#8790ff] bg-transparent px-8 py-3 text-sm font-medium text-[#e5e8ff] transition-colors hover:bg-[#2630ca]"
          >
            [ &nbsp; Six-stage pipeline &nbsp; ]
          </a>
        </div>
      </div>
    </section>
  );
}
