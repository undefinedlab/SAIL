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
  const track = [...STACK_ITEMS, ...STACK_ITEMS];

  return (
    <div className="overflow-hidden py-1">
      <div className="workflow-marquee workflow-marquee--left flex w-max gap-2">
        {track.map((item, idx) => {
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
            <span
              key={`${item.key}-${idx}`}
              className="inline-flex shrink-0 items-center gap-2 border border-[#05058a]/20 bg-white/90 px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-[#05058a] backdrop-blur-[2px]"
              title={item.description}
            >
              <StatusDot status={status} label={item.label} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
