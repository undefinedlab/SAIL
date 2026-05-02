import { SailOperatorPanel } from "@/components/dashboard/SailOperatorPanel";
import { ConsoleFrame } from "@/components/dashboard/ConsoleFrame";
import { Navbar } from "@/components/landing";

export default function OperatorDashboardPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f5f5f0] px-6 pb-12 pt-24">
        <div className="mx-auto max-w-[1440px]">
          <ConsoleFrame
            eyebrow="Operator Path"
            title="Your Sail Toolbox"
            description="Register agents, run Pipeline, monitor on-chain state, extend with Identity and Agent to agent communication via Mesh."
          >
            <SailOperatorPanel />
          </ConsoleFrame>
        </div>
      </main>
    </>
  );
}
