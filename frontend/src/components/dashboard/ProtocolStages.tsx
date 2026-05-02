const STAGES = [
  {
    id: "01",
    title: "Attest Inputs",
    copy: "Hash the exact task payload before any reasoning begins.",
  },
  {
    id: "02",
    title: "Reason",
    copy: "Run agent logic directly or route through 0G Compute for the ZK tier.",
  },
  {
    id: "03",
    title: "Commit",
    copy: "Encrypt with Lit, upload to 0G Storage, then anchor the commitment on-chain.",
  },
  {
    id: "04",
    title: "Execute",
    copy: "Clear the SAIL contract gate only after a valid prior commitment exists.",
  },
  {
    id: "05",
    title: "Deliver",
    copy: "Send the resulting action through the operator or mesh delivery path.",
  },
  {
    id: "06",
    title: "Audit",
    copy: "Retrieve the sealed blob, verify provenance, and slash only on proven mismatch.",
  },
];

const MODULES = [
  { label: "User / MCP", accent: "bg-white" },
  { label: "Operator Agent", accent: "bg-[#f1edff]" },
  { label: "AXL", accent: "bg-[#d9f2d0]" },
  { label: "ENS", accent: "bg-[#bfdbfe]" },
  { label: "SAIL Contract", accent: "bg-[#f1edff]" },
  { label: "Lit Protocol", accent: "bg-[#bfdbfe]" },
  { label: "0G Storage", accent: "bg-[#bfdbfe]" },
  { label: "0G Compute", accent: "bg-[#bfdbfe]" },
];

export function ProtocolStages() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="border border-[#05058a]/10 bg-white p-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
          Pipeline
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {STAGES.map((stage) => (
            <article key={stage.id} className="border border-[#05058a]/10 bg-[#f5f5f0] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/45">
                Stage {stage.id}
              </p>
              <h3 className="mt-2 text-base font-bold text-[#05058a]">{stage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#05058a]/68">{stage.copy}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="border border-[#05058a]/10 bg-white p-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
          System Map
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {MODULES.map((module) => (
            <div
              key={module.label}
              className={`min-h-24 border border-[#05058a]/12 p-4 ${module.accent}`}
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/45">
                Module
              </p>
              <p className="mt-2 text-lg font-bold tracking-[-0.02em] text-[#05058a]">
                {module.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
