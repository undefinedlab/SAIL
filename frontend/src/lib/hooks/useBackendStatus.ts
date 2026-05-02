"use client";
import { useEffect, useState } from "react";
import { healthCheck } from "@/lib/sail-api";

export type BackendInfo = {
  status: "checking" | "online" | "offline";
  contract?: string;
  operator?: string;
  chainId?: number;
  axlOnline?: boolean;
  axlBridgeUrl?: string;
  timestamp?: string;
  refresh: () => Promise<void>;
};

export function useBackendStatus(): BackendInfo {
  const [info, setInfo] = useState<Omit<BackendInfo, "refresh">>({ status: "checking" });

  async function refresh() {
    try {
      const r = await healthCheck();
      setInfo({
        status: "online",
        contract: r.contract,
        operator: r.operator,
        chainId: r.chainId,
        axlOnline: r.axl?.online,
        axlBridgeUrl: r.axl?.bridgeUrl,
        timestamp: r.timestamp,
      });
    } catch {
      setInfo({ status: "offline" });
    }
  }

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const r = await healthCheck();
        if (!cancelled) {
          setInfo({
            status: "online",
            contract: r.contract,
            operator: r.operator,
            chainId: r.chainId,
            axlOnline: r.axl?.online,
            axlBridgeUrl: r.axl?.bridgeUrl,
            timestamp: r.timestamp,
          });
        }
      } catch {
        if (!cancelled) {
          setInfo({ status: "offline" });
        }
      }
    };

    void run();
    const interval = window.setInterval(() => {
      void run();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return { ...info, refresh };
}
