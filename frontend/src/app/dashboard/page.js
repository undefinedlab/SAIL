import Link from "next/link";
import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { Navbar, SiteFooter } from "@/components/landing";

const OPERATOR_VISUAL =
  "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&q=80";
const AUDITOR_VISUAL =
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&q=80";

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f5f5f0] px-6 pb-20 pt-24">
        <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-[960px] items-center justify-center">
          <section className="w-full border border-[#05058a]/15 bg-white p-8 md:p-10">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              Console
            </p>
            <h1 className="mt-3 text-[clamp(34px,5vw,62px)] font-black leading-[0.95] tracking-[-0.03em] text-[#05058a]">
              Choose your path
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#05058a]/70">
              Select the dashboard flow that matches your role.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Link
                href="/dashboard/operator"
                data-oci-cursor="on-dark"
                className="group relative aspect-square overflow-hidden border border-[#05058a]/20 bg-[#f5f5f0] p-6 transition-colors hover:bg-white"
              >
                <div className="absolute inset-0">
                  <BayerDitherImage src={OPERATOR_VISUAL} alt="Operator dashboard path" className="h-full w-full" />
                  <div className="absolute inset-0 bg-[#05058a]/35 transition-colors duration-300 group-hover:bg-[#05058a]/20" />
                </div>
                <div className="relative z-10 flex h-full flex-col justify-end text-white">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/80">
                    Path A
                  </p>
                  <p className="mt-3 text-2xl font-black tracking-[-0.02em] text-white">
                    Operator
                  </p>
                  <p className="mt-3 text-sm text-white/85">
                    Register agents, monitor commitments, and handle audit requests.
                  </p>
                </div>
              </Link>

              <Link
                href="/dashboard/auditor"
                data-oci-cursor="on-dark"
                className="group relative aspect-square overflow-hidden border border-[#05058a]/20 bg-[#f5f5f0] p-6 transition-colors hover:bg-white"
              >
                <div className="absolute inset-0">
                  <BayerDitherImage src={AUDITOR_VISUAL} alt="Auditor dashboard path" className="h-full w-full" />
                  <div className="absolute inset-0 bg-[#05058a]/35 transition-colors duration-300 group-hover:bg-[#05058a]/20" />
                </div>
                <div className="relative z-10 flex h-full flex-col justify-end text-white">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/80">
                    Path B
                  </p>
                  <p className="mt-3 text-2xl font-black tracking-[-0.02em] text-white">
                    Auditor
                  </p>
                  <p className="mt-3 text-sm text-white/85">
                    Submit signed reveal requests and review responses.
                  </p>
                </div>
              </Link>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
