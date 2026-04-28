"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Operators_Dash() {
  return (
    <div className="w-full">
      <div className="border border-[#05058a]/15 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[62rem]">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              Path A — Operator dashboard
            </p>
            <h1 className="mt-3 text-[clamp(34px,4.8vw,62px)] font-black leading-[0.95] tracking-[-0.03em] text-[#05058a]">
              Control room
            </h1>
          </div>

          <div className="w-full md:w-auto md:text-right">
            <div className="md:hidden">
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border border-[#05058a]/15 bg-white p-6">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
          Operator flow
        </p>
        <h2 className="mt-3 text-2xl font-black tracking-[-0.02em] text-[#05058a]">
          Operator modules temporarily unavailable
        </h2>
        <p className="mt-3 max-w-[72ch] text-sm leading-relaxed text-[#05058a]/70">
          The operator submodules are not present in this branch yet, so this view is temporarily
          reduced to avoid runtime/build errors. Auditor flow is fully available now.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/auditor"
            className="bg-[#05058a] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90"
          >
            Open auditor path
          </Link>
          <Link
            href="/dashboard"
            className="border border-[#05058a]/20 bg-[#f5f5f0] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a] transition-colors hover:bg-white"
          >
            Back to selector
          </Link>
        </div>
      </div>
    </div>
  );
}

