"use client";

import Link from "next/link";
import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { Navbar, SiteFooter } from "@/components/landing";
import { ConsoleFrame } from "@/components/dashboard/ConsoleFrame";
import { InfraOverview } from "@/components/dashboard/InfraOverview";
import { ProtocolStages } from "@/components/dashboard/ProtocolStages";
import { useBackendStatus } from "@/lib/hooks/useBackendStatus";

const OPERATOR_VISUAL =
  "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&q=80";
const AUDITOR_VISUAL =
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&q=80";

function DashboardSurface() {
  const backend = useBackendStatus();

  return (
    <ConsoleFrame
      eyebrow="Console"
      title="Mission control for every SAIL surface"
      description="This console is now the place to inspect infrastructure health, follow the six-stage protocol, and jump into the exact operator or auditor flow needed to test each subsystem."
      aside={
        <div className="space-y-2 text-xs text-[#05058a]/68">
          <p>Backend, chain, and AXL health auto-refresh every 15 seconds.</p>
          <p>Use Operator for commit-path testing and Auditor for reveal-path testing.</p>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/dashboard/operator"
            data-oci-cursor="on-dark"
            className="group relative aspect-[1.12] overflow-hidden border border-[#05058a]/20 bg-[#f5f5f0] p-6 transition-colors hover:bg-white"
          >
            <div className="absolute inset-0">
              <BayerDitherImage src={OPERATOR_VISUAL} alt="Operator dashboard path" className="h-full w-full" />
              <div className="absolute inset-0 bg-[#05058a]/35 transition-colors duration-300 group-hover:bg-[#05058a]/15" />
            </div>
            <div className="relative z-10 flex h-full flex-col justify-between text-white">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/80">
                Path A
              </p>
              <div>
                <p className="text-2xl font-black tracking-[-0.02em] text-white">
                  Operator
                </p>
                <p className="mt-3 max-w-[28ch] text-sm text-white/88">
                  Register agents, run the full commitment pipeline, manage ENS identity, and probe the AXL mesh.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/auditor"
            data-oci-cursor="on-dark"
            className="group relative aspect-[1.12] overflow-hidden border border-[#05058a]/20 bg-[#f5f5f0] p-6 transition-colors hover:bg-white"
          >
            <div className="absolute inset-0">
              <BayerDitherImage src={AUDITOR_VISUAL} alt="Auditor dashboard path" className="h-full w-full" />
              <div className="absolute inset-0 bg-[#05058a]/35 transition-colors duration-300 group-hover:bg-[#05058a]/15" />
            </div>
            <div className="relative z-10 flex h-full flex-col justify-between text-white">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/80">
                Path B
              </p>
              <div>
                <p className="text-2xl font-black tracking-[-0.02em] text-white">
                  Auditor
                </p>
                <p className="mt-3 max-w-[28ch] text-sm text-white/88">
                  Inspect commitments, fetch sealed blobs, validate the audit chain, and use the slash flow only after confirmed evidence.
                </p>
              </div>
            </div>
          </Link>
        </div>

        <InfraOverview backend={backend} />
        <ProtocolStages />

        <div className="grid gap-4 xl:grid-cols-3">
          {[
            {
              title: "Test contract + storage",
              body: "Use Operator → Pipeline to attest, commit, upload to 0G, and clear the execute gate in one guided flow.",
              href: "/dashboard/operator",
            },
            {
              title: "Test identity + mesh",
              body: "Use Operator → Identity and Mesh to inspect ENS records, register a subname, poll AXL topology, and send messages.",
              href: "/dashboard/operator",
            },
            {
              title: "Test audit + slash path",
              body: "Use Auditor → Lookup and Audit to inspect anchored commitments and verify sealed blob retrieval before any slash decision.",
              href: "/dashboard/auditor",
            },
          ].map((item) => (
            <article key={item.title} className="border border-[#05058a]/10 bg-[#f5f5f0] p-4">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-[#05058a]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#05058a]/68">
                {item.body}
              </p>
              <Link
                href={item.href}
                className="mt-5 inline-flex border border-[#05058a] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[#05058a] transition-colors hover:bg-[#05058a] hover:text-white"
              >
                Open console
              </Link>
            </article>
          ))}
        </div>
      </div>
    </ConsoleFrame>
  );
}

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f5f5f0] px-6 pb-20 pt-24">
        <div className="mx-auto max-w-[1440px]">
          <DashboardSurface />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
