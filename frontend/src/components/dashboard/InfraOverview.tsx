import { expectedChain, sailApiLabel } from "@/lib/wagmi-config";
import type { BackendInfo } from "@/lib/hooks/useBackendStatus";
import { StatusDot } from "@/components/ui/StatusDot";

type InfraOverviewProps = {
  backend: BackendInfo;
};

const STACK_ITEMS = [
  {
    key: "contract",
    label: "SAIL Contract",
    description: "Commit gate, registry, and slash enforcement on-chain.",
  },
  {
    key: "lit",
    label: "Lit Protocol",
    description: "Threshold access control for commitment reveal.",
  },
  {
    key: "storage",
    label: "0G Storage",
    description: "Encrypted commitment blobs anchored by root hash.",
  },
  {
    key: "compute",
    label: "0G Compute",
    description: "Optional sealed inference for the ZK trust tier.",
  },
  {
    key: "ens",
    label: "ENS",
    description: "Identity and capability discovery for agent namespaces.",
  },
  {
    key: "axl",
    label: "AXL Mesh",
    description: "Peer topology, message relay, and delivery path testing.",
  },
];

export function InfraOverview({ backend }: InfraOverviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 border border-[#05058a]/10 bg-[#f5f5f0] px-4 py-3 text-xs text-[#05058a]/75">
        <StatusDot
          status={backend.status}
          label={
            backend.status === "online"
              ? "backend online"
              : backend.status === "offline"
                ? "backend offline"
                : "checking backend"
          }
        />
        <span>Expected chain: {expectedChain.name}</span>
        <span>Frontend API: {sailApiLabel}</span>
        {backend.chainId ? <span>Backend chain ID: {backend.chainId}</span> : null}
        {backend.axlBridgeUrl ? <span>AXL bridge: {backend.axlBridgeUrl}</span> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {STACK_ITEMS.map((item) => {
          const isAxl = item.key === "axl";
          const status =
            backend.status === "online"
              ? isAxl
                ? backend.axlOnline
                  ? "online"
                  : "offline"
                : "online"
              : backend.status;

          return (
            <article key={item.key} className="border border-[#05058a]/10 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
                    Integration
                  </p>
                  <h3 className="mt-2 text-lg font-bold tracking-[-0.02em] text-[#05058a]">
                    {item.label}
                  </h3>
                </div>
                <StatusDot status={status} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[#05058a]/68">
                {item.description}
              </p>
              {item.key === "contract" && backend.contract ? (
                <p className="mt-4 break-all font-mono text-[11px] text-[#05058a]/62">
                  {backend.contract}
                </p>
              ) : null}
              {item.key === "axl" && backend.axlBridgeUrl ? (
                <p className="mt-4 break-all font-mono text-[11px] text-[#05058a]/62">
                  {backend.axlBridgeUrl}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
