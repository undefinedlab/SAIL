import { SailAuditorPanel } from "@/components/dashboard/SailAuditorPanel";
import { ConsoleFrame } from "@/components/dashboard/ConsoleFrame";
import { Navbar } from "@/components/landing";

export default function AuditorDashboardPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f5f5f0] px-6 pb-12 pt-24">
        <div className="mx-auto max-w-[1440px]">
          <ConsoleFrame
            eyebrow="Auditor Path"
            title="Inspect the reveal and enforcement path"
            description="Look up anchored commitments, inspect sealed blobs, and only then decide whether the slash path is justified."
          >
            <SailAuditorPanel />
          </ConsoleFrame>
        </div>
      </main>
    </>
  );
}
