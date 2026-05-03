"use client";

import { ConsoleFrame } from "@/components/dashboard/ConsoleFrame";
import { SailAgentMeshPanel } from "@/components/dashboard/SailAgentMeshPanel";

export function AgentDashboard() {
  return (
    <ConsoleFrame
      eyebrow="Agent Path"
      title="Mesh & agent-to-agent"
      description="Discover peers on ENS, delegate work over the AXL P2P mesh, track delegations, and run the task router—same tools as before, on a path dedicated to coordination."
    >
      <SailAgentMeshPanel />
    </ConsoleFrame>
  );
}
