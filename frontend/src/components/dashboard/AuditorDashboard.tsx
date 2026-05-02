"use client";

import { useState } from "react";
import { ConsoleFrame } from "@/components/dashboard/ConsoleFrame";
import { SailAuditorPanel, type AuditorWorkspaceTab } from "@/components/dashboard/SailAuditorPanel";

function tabCls(active: AuditorWorkspaceTab, value: AuditorWorkspaceTab) {
  return `rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
    active === value
      ? "bg-[#05058a] text-white shadow-sm"
      : "border border-[#05058a]/20 bg-white text-[#05058a]/80 hover:border-[#05058a]/45 hover:text-[#05058a]"
  }`;
}

export function AuditorDashboard() {
  const [tab, setTab] = useState<AuditorWorkspaceTab>("lookup");

  return (
    <ConsoleFrame
      eyebrow="Auditor Path"
      title="Inspect the reveal and enforcement path"
      description="Look up anchored commitments, inspect sealed blobs, and only then decide whether the slash path is justified."
      headerTrailing={
        <nav className="flex flex-wrap justify-end gap-2" aria-label="Auditor steps">
          <button type="button" className={tabCls(tab, "lookup")} onClick={() => setTab("lookup")}>
            Lookup
          </button>
          <button type="button" className={tabCls(tab, "audit")} onClick={() => setTab("audit")}>
            Audit
          </button>
          <button type="button" className={tabCls(tab, "slash")} onClick={() => setTab("slash")}>
            Slash
          </button>
        </nav>
      }
    >
      <SailAuditorPanel activeTab={tab} onTabChange={setTab} />
    </ConsoleFrame>
  );
}
