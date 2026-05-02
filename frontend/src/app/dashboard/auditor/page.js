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
            description="Use this console to look up anchored commitments, inspect sealed blobs, and only then decide whether the slash path is justified."
            aside={
              <div className="space-y-2 text-xs text-[#05058a]/68">
                <p>Recommended order: lookup → audit → slash.</p>
                <p>Slash is intentionally separated from retrieval so the console does not push unsafe conclusions.</p>
              </div>
            }
          >
            <SailAuditorPanel />
          </ConsoleFrame>
        </div>
      </main>
    </>
  );
}
