"use client";

type Status = "online" | "offline" | "checking";

const colors: Record<Status, string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  checking: "bg-amber-400 animate-pulse",
};

export function StatusDot({ status, label }: { status: Status; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
      <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
      {label ?? status}
    </span>
  );
}
