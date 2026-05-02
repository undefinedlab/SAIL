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
            title="Run the full SAIL commit path"
            description="This is the hands-on operator workspace for contract registration, pipeline execution, ENS identity setup, and AXL messaging tests."
            aside={
              <div className="space-y-2 text-xs text-[#05058a]/68">
                <p>Recommended order: register → pipeline → monitor → identity → mesh.</p>
                <p>Every write flow depends on the backend operator wallet and a healthy Sepolia setup.</p>
              </div>
            }
          >
            <SailOperatorPanel />
          </ConsoleFrame>
        </div>
      </main>
    </>
  );
}
