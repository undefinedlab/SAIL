"use client";

import { ConsoleFrame } from "@/components/dashboard/ConsoleFrame";
import { SailAuditorPanel } from "@/components/dashboard/SailAuditorPanel";

export function AuditorDashboard() {
  return (
    <ConsoleFrame
      eyebrow="Auditor Path"
      title="> Inspect, Reveal, Enforce"
      description="Look up anchored commitments, inspect sealed blobs, and only then decide whether the slash path is justified."
    >
      <SailAuditorPanel />
    </ConsoleFrame>
  );
}
