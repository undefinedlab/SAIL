import { BayerDitherHero } from "@/components/hero/BayerDitherHero";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1501771924607-209f42a6e7e4?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fHNhaWxpbmd8ZW58MHx8MHx8fDA%3D";

export function HeroSection() {
  return (
    <section
      id="top"
      data-oci-cursor="on-light"
      className="relative box-border h-[100dvh] min-h-[100svh] w-full min-w-0 overflow-hidden bg-[#f5f5f0]"
    >
      <div
        data-oci-cursor="on-dark"
        className="absolute bottom-[2.5dvh] left-1/2 top-[8dvh] z-0 w-[min(108vw,1440px)] -translate-x-1/2"
      >
        <BayerDitherHero imageSrc={HERO_IMAGE} className="h-full w-full" />
      </div>

      <div className="pointer-events-none relative z-20 h-full min-h-0 w-full px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto h-full max-w-7xl">
          <p className="oci-hero-tagline absolute bottom-44 left-0 max-w-[min(100%,30rem)] text-[clamp(16px,4.2vw,24px)] font-light leading-snug text-white md:bottom-auto md:left-auto md:right-0 md:top-1/2 md:w-[min(40%,34rem)] md:max-w-none md:-translate-y-1/2 md:text-right">
            <span className="block">Confidential & verifiable execution</span>
            <span className="block">for AI agents on-chain.</span>
          </p>

          <h1 className="absolute bottom-0 left-0 max-w-[95vw] pb-8 font-black text-white [text-shadow:0_18px_52px_rgba(0,0,0,0.22)] md:max-w-[70%] md:pb-14">
            <div className="tracking-[-0.03em] [font-size:clamp(112px,19vw,260px)] leading-[0.9]">
              <span className="oci-hero-line block">SAIL</span>
              <span className="oci-hero-line oci-hero-line--2 mt-[0.07em] block text-[0.152em] font-black leading-[1.08] tracking-[-0.03em]">
                Secure Agentic Intelligence Layer
              </span>
            </div>
          </h1>
        </div>
      </div>
    </section>
  );
}
