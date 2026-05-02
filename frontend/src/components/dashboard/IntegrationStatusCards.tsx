import type { BackendInfo } from "@/lib/hooks/useBackendStatus";
import { StatusDot } from "@/components/ui/StatusDot";

type IntegrationStatusCardsProps = {
  backend: BackendInfo;
  /** Inline mini chips for toolbar layout (e.g. beside tab switcher). */
  variant?: "default" | "compact";
};

const STACK_ITEMS = [
  {
    key: "contract",
    label: "SAIL Contract",
    description: "Commit gate, registry, and slash on-chain.",
  },
  {
    key: "lit",
    label: "Lit Protocol",
    description: "Threshold access for commitment reveal.",
  },
  {
    key: "storage",
    label: "0G Storage",
    description: "Encrypted blobs by root hash.",
  },
  {
    key: "compute",
    label: "0G Compute",
    description: "Optional sealed inference (ZK tier).",
  },
  {
    key: "ens",
    label: "ENS",
    description: "Agent namespaces and discovery.",
  },
  {
    key: "axl",
    label: "AXL Mesh",
    description: "Topology and message relay.",
  },
] as const;

function itemStatus(backend: BackendInfo, itemKey: (typeof STACK_ITEMS)[number]["key"]) {
  if (backend.status !== "online") return backend.status;
  if (itemKey === "axl") return backend.axlOnline ? "online" : "offline";
  return "online" as const;
}

export function IntegrationStatusCards({ backend, variant = "default" }: IntegrationStatusCardsProps) {
  const items = STACK_ITEMS.map((item) => ({ item, status: itemStatus(backend, item.key) }));

  if (variant === "compact") {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {items.map(({ item, status }) => (
          <article
            key={item.key}
            className="flex shrink-0 items-center gap-1 border border-[#05058a]/10 bg-white px-1.5 py-0.5"
            title={item.description}
          >
            <StatusDot status={status} label="" />
            <span className="whitespace-nowrap text-[9px] font-bold leading-none tracking-[-0.02em] text-[#05058a]">
              {item.label}
            </span>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(({ item, status }) => (
        <article
          key={item.key}
          className="border border-[#05058a]/10 bg-white px-2.5 py-2"
          title={item.description}
        >
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="text-[11px] font-bold leading-tight tracking-[-0.02em] text-[#05058a]">
              {item.label}
            </h3>
            <StatusDot status={status} label="" />
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-[#05058a]/55">{item.description}</p>
          {item.key === "contract" && backend.contract ? (
            <p className="mt-1.5 break-all font-mono text-[9px] text-[#05058a]/45">
              {backend.contract.slice(0, 10)}…{backend.contract.slice(-6)}
            </p>
          ) : null}
          {item.key === "axl" && backend.axlBridgeUrl ? (
            <p className="mt-1.5 truncate font-mono text-[9px] text-[#05058a]/45" title={backend.axlBridgeUrl}>
              {backend.axlBridgeUrl.replace(/^https?:\/\//, "")}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
