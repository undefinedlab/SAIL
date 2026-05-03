"use client";

import Link from "next/link";
import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { Navbar, SiteFooter } from "@/components/landing";
import { ConsoleFrame } from "@/components/dashboard/ConsoleFrame";

const OPERATOR_VISUAL =
  "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&q=80";
const AUDITOR_VISUAL =
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&q=80";
const AGENT_VISUAL =
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=900&q=80";

function DashboardSurface() {
  return (
    <ConsoleFrame
      variant="minimal"
      eyebrow="Console"
      title="Let's Sail together"
      description="Run the accountability pipeline, register and watch agents, or open the mesh path for agent-to-agent coordination."
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                  Register agents, run the full commitment pipeline, manage ENS identity, and coordinate audits.
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

          <Link
            href="/dashboard/agent"
            data-oci-cursor="on-dark"
            className="group relative aspect-[1.12] overflow-hidden border border-[#05058a]/20 bg-[#f5f5f0] p-6 transition-colors hover:bg-white md:col-span-2 lg:col-span-1"
          >
            <div className="absolute inset-0">
              <BayerDitherImage src={AGENT_VISUAL} alt="Agent mesh path" className="h-full w-full" />
              <div className="absolute inset-0 bg-[#05058a]/35 transition-colors duration-300 group-hover:bg-[#05058a]/15" />
            </div>
            <div className="relative z-10 flex h-full flex-col justify-between text-white">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/80">Path C</p>
              <div>
                <p className="text-2xl font-black tracking-[-0.02em] text-white">Agent</p>
                <p className="mt-3 max-w-[28ch] text-sm text-white/88">
                  AXL topology, peer discovery, delegation, raw mesh messaging, and task router — one workspace for agent-to-agent traffic.
                </p>
              </div>
            </div>
          </Link>
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
