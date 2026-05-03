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
            title="Sailor's Toolbox"
            description="Register Agents Identity, run Pipeline, Monitor on-chain state, run Agent-to-Agent communication."
          >
            <SailOperatorPanel />
          </ConsoleFrame>
        </div>
      </main>
    </>
  );
}
