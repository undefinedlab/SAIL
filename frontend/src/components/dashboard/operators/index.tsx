"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { sailAbi } from "@/lib/sail-abi";
import { expectedChain, sailApiBase, sailContractAddress } from "@/lib/wagmi-config";

type Health = { status: string; service?: string; timestamp?: number };

export function OperatorsPanel() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();

  const contractOk = isAddress(sailContractAddress);
  const addr = contractOk ? sailContractAddress : undefined;

  const { data: commitmentCount } = useReadContract({
    address: addr,
    abi: sailAbi,
    functionName: "commitmentCount",
    query: { enabled: contractOk },
  });

  const wrongChain = isConnected && chainId !== expectedChain.id;
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${sailApiBase}/health`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          setHealth(j);
          setHealthError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setHealth(null);
          setHealthError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = [
    {
      id: "01",
      title: "Backend online",
      ok: health?.status === "ok",
      warn: Boolean(healthError),
      detail: healthError
        ? `API unreachable (${healthError})`
        : health
          ? `Backend ${health.service ?? "ok"}`
          : `API: ${sailApiBase}`,
    },
    {
      id: "02",
      title: "Wallet connected",
      ok: isConnected,
      warn: false,
      detail:
        isConnected && address
          ? `${address.slice(0, 6)}…${address.slice(-4)}`
          : "Connect to read contract",
    },
    {
      id: "03",
      title: "Correct network",
      ok: !wrongChain,
      warn: isConnected && wrongChain,
      detail: wrongChain ? `Switch to ${expectedChain.name}` : expectedChain.name,
    },
    {
      id: "04",
      title: "Contract configured",
      ok: contractOk,
      warn: !contractOk,
      detail: contractOk ? sailContractAddress : "Set NEXT_PUBLIC_SAIL_CONTRACT_ADDRESS",
    },
  ];

  return (
    <div className="w-full">
      <div className="border border-[#05058a]/15 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-[62rem]">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              operators
            </p>
            <h1 className="mt-3 text-[clamp(34px,4.8vw,62px)] font-black leading-[0.95] tracking-[-0.03em] text-[#05058a]">
              Connection status
            </h1>
            <p className="mt-4 max-w-[56rem] text-sm leading-relaxed text-[#05058a]/70">
              Verify backend connectivity, wallet connection, network, and contract configuration before operating.
            </p>
          </div>

          <div className="w-full md:w-auto md:text-right">
            <div className="md:hidden">
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#05058a]/55 md:mt-2">
              Operator view
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
            Setup status
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {steps.map((s) => (
              <div
                key={s.id}
                className={`border px-4 py-3 ${
                  s.ok
                    ? "border-[#05058a]/15 bg-white"
                    : s.warn
                      ? "border-amber-300 bg-amber-50"
                      : "border-[#05058a]/15 bg-[#f5f5f0]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] text-[#2020e8]">{s.id}</p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#05058a]/55">
                    {s.ok ? "ready" : "todo"}
                  </p>
                </div>
                <p className="mt-2 text-sm font-black tracking-[-0.01em] text-[#05058a]">
                  {s.title}
                </p>
                <p className="mt-1 text-xs text-[#05058a]/65">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {contractOk && (
          <div className="mt-6 border-t border-[#05058a]/15 pt-6">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#05058a]/65">
              Quick stats
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border border-[#05058a]/15 bg-white px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                  Commitments
                </p>
                <p className="mt-2 font-mono text-lg text-[#2020e8]">
                  {commitmentCount !== undefined ? String(commitmentCount) : "—"}
                </p>
              </div>
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                  Backend URL
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#05058a]/70">
                  {sailApiBase}
                </p>
              </div>
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                  Chain
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#05058a]/70">
                  Ethereum Sepolia
                </p>
              </div>
              <div className="border border-[#05058a]/15 bg-[#f5f5f0] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#05058a]/60">
                  Contract
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#05058a]/70 truncate">
                  {sailContractAddress.slice(0, 8)}…
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
