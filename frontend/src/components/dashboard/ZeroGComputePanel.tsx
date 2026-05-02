"use client";

import { useEffect, useState } from "react";
import {
  getComputeProviders,
  getComputeLedger,
  setupComputeLedger,
  depositComputeFund,
  getComputeLedgerProviders,
  reason,
  type ComputeProvider,
  type LedgerInfo,
  type ReasonResponse,
} from "@/lib/sail-api";

type LedgerProviderBalance = {
  provider: string;
  balance: string;
  pendingRefund: string;
};

function shortAddr(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function neuronToA0gi(neuron: string): string {
  try {
    const n = BigInt(neuron);
    const ONE = BigInt("1000000000000000000");
    const ZERO = BigInt(0);
    const whole = n / ONE;
    const frac = n % ONE;
    if (frac === ZERO) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole}.${fracStr.slice(0, 4)}`;
  } catch {
    return neuron;
  }
}

export function ZeroGComputePanel({ backendOnline }: { backendOnline: boolean }) {
  // --- Ledger state ---
  const [ledger, setLedger] = useState<LedgerInfo | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [setupAmount, setSetupAmount] = useState("3");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupResult, setSetupResult] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("1");
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositResult, setDepositResult] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [fundedProviders, setFundedProviders] = useState<LedgerProviderBalance[]>([]);

  // --- Providers state ---
  const [providers, setProviders] = useState<ComputeProvider[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  // --- Inference state ---
  const [prompt, setPrompt] = useState("");
  const [sysPrompt, setSysPrompt] = useState(
    "You are an AI agent. Respond concisely.",
  );
  const [infBusy, setInfBusy] = useState(false);
  const [infResult, setInfResult] = useState<ReasonResponse | null>(null);
  const [infError, setInfError] = useState<string | null>(null);

  // --- Load ledger + providers on mount ---
  useEffect(() => {
    if (!backendOnline) return;
    refreshLedger();
    refreshProviders();
  }, [backendOnline]);

  async function refreshLedger() {
    setLedgerBusy(true);
    setLedgerError(null);
    try {
      const res = await getComputeLedger();
      setLedger(res.ledger);
      const fp = await getComputeLedgerProviders();
      setFundedProviders(fp.providers);
    } catch (e) {
      setLedgerError((e as Error).message);
      setLedger(null);
    } finally {
      setLedgerBusy(false);
    }
  }

  async function refreshProviders() {
    setProviderError(null);
    try {
      const res = await getComputeProviders(modelFilter || undefined);
      setProviders(res.providers);
      if (res.providers.length > 0 && !selectedProvider) {
        setSelectedProvider(res.providers[0].provider);
      }
    } catch (e) {
      setProviderError((e as Error).message);
    }
  }

  async function handleSetupLedger() {
    setSetupBusy(true);
    setSetupError(null);
    setSetupResult(null);
    try {
      const n = Number(setupAmount);
      if (n < 3) throw new Error("Minimum 3 0G required to create a ledger");
      const res = await setupComputeLedger(n);
      setSetupResult(`Ledger ${res.action} with ${res.amount} 0G`);
      await refreshLedger();
    } catch (e) {
      setSetupError((e as Error).message);
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleDeposit() {
    setDepositBusy(true);
    setDepositError(null);
    setDepositResult(null);
    try {
      const n = Number(depositAmount);
      if (n <= 0) throw new Error("Amount must be > 0");
      await depositComputeFund(n);
      setDepositResult(`Deposited ${n} 0G`);
      await refreshLedger();
    } catch (e) {
      setDepositError((e as Error).message);
    } finally {
      setDepositBusy(false);
    }
  }

  async function handleInference() {
    setInfBusy(true);
    setInfError(null);
    setInfResult(null);
    try {
      if (!prompt.trim()) throw new Error("Prompt required");
      const res = await reason(prompt, sysPrompt || undefined);
      setInfResult(res);
    } catch (e) {
      setInfError((e as Error).message);
    } finally {
      setInfBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* ---- LEFT COLUMN: Ledger + Inference ---- */}
      <div className="space-y-6">
        {/* LEDGER SECTION */}
        <section className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
              0G Compute
            </p>
            <h3 className="mt-2 text-base font-bold text-[#05058a]">
              Ledger &amp; Funding
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#05058a]/68">
              Your 0G token balance on the compute network. Fund it to pay for sealed inference calls.
            </p>
          </div>

          {/* Ledger balance */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={refreshLedger}
              disabled={ledgerBusy || !backendOnline}
              className="border border-[#05058a] px-3 py-1.5 text-xs text-[#05058a] disabled:opacity-40"
            >
              {ledgerBusy ? "Loading…" : "Refresh"}
            </button>
            {ledger ? (
              <div className="flex flex-wrap gap-4 text-xs">
                <span>
                  <span className="text-neutral-500">Total:</span>{" "}
                  <span className="font-medium text-[#05058a]">
                    {neuronToA0gi(ledger.totalBalance)} 0G
                  </span>
                </span>
                <span>
                  <span className="text-neutral-500">Available:</span>{" "}
                  <span className="font-medium text-[#05058a]">
                    {neuronToA0gi(ledger.availableBalance)} 0G
                  </span>
                </span>
              </div>
            ) : ledgerError ? (
              <span className="text-xs text-amber-700">No ledger yet</span>
            ) : null}
          </div>
          {ledgerError && !ledger ? (
            <p className="text-xs text-neutral-500">
              Create a ledger to start using 0G Compute inference.
            </p>
          ) : null}

          {/* Setup / Deposit */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs text-neutral-500">
                {ledger ? "Top up (0G)" : "Create ledger (min 3 0G)"}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={ledger ? "0.1" : "3"}
                  step="0.5"
                  className="w-24 border border-neutral-300 px-2 py-1.5 text-sm"
                  value={ledger ? depositAmount : setupAmount}
                  onChange={(e) =>
                    ledger
                      ? setDepositAmount(e.target.value)
                      : setSetupAmount(e.target.value)
                  }
                />
                <button
                  onClick={ledger ? handleDeposit : handleSetupLedger}
                  disabled={
                    (ledger ? depositBusy : setupBusy) || !backendOnline
                  }
                  className="bg-[#05058a] px-4 py-1.5 text-xs text-white disabled:opacity-40"
                >
                  {ledger
                    ? depositBusy
                      ? "Depositing…"
                      : "Deposit"
                    : setupBusy
                      ? "Creating…"
                      : "Create ledger"}
                </button>
              </div>
              {setupResult ? (
                <p className="text-xs text-emerald-700">{setupResult}</p>
              ) : null}
              {setupError ? (
                <p className="text-xs text-red-700">{setupError}</p>
              ) : null}
              {depositResult ? (
                <p className="text-xs text-emerald-700">{depositResult}</p>
              ) : null}
              {depositError ? (
                <p className="text-xs text-red-700">{depositError}</p>
              ) : null}
            </div>

            {/* Funded sub-accounts */}
            {fundedProviders.length > 0 ? (
              <div className="space-y-2">
                <label className="block text-xs text-neutral-500">
                  Funded sub-accounts
                </label>
                {fundedProviders.map((fp) => (
                  <div
                    key={fp.provider}
                    className="border border-neutral-200 bg-white px-3 py-2 text-[11px]"
                  >
                    <p className="font-mono text-[#05058a]">
                      {shortAddr(fp.provider)}
                    </p>
                    <p className="text-neutral-500">
                      Balance: {neuronToA0gi(fp.balance)} · Pending:{" "}
                      {neuronToA0gi(fp.pendingRefund)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* INFERENCE SECTION */}
        <section className="space-y-4 border border-neutral-200 bg-white p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
              Sealed inference
            </p>
            <h3 className="mt-2 text-base font-bold text-[#05058a]">
              Run 0G Compute
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#05058a]/68">
              Route a prompt through the 0G Compute TEE. The response + attestation are embedded in the SAIL commitment blob for ZK-tier agents.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              System prompt
            </label>
            <input
              className="w-full border border-neutral-300 px-2 py-1.5 text-sm"
              value={sysPrompt}
              onChange={(e) => setSysPrompt(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              User prompt
            </label>
            <textarea
              className="w-full border border-neutral-300 px-2 py-1.5 font-mono text-xs"
              rows={4}
              placeholder="Ask the model anything…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleInference}
              disabled={infBusy || !backendOnline || !prompt.trim()}
              className="bg-[#05058a] px-5 py-2 text-sm text-white disabled:opacity-40"
            >
              {infBusy ? "Running inference…" : "Run sealed inference"}
            </button>
            {infBusy ? (
              <span className="text-xs italic text-neutral-500">
                Acknowledging provider → sending request → verifying…
              </span>
            ) : null}
          </div>

          {infError ? (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {infError}
            </p>
          ) : null}

          {infResult ? (
            <div className="space-y-2 border border-emerald-200 bg-emerald-50 p-4 text-xs">
              <p className="font-medium text-emerald-800">
                ✓ Inference complete
              </p>
              <dl className="grid gap-x-4 gap-y-2 md:grid-cols-2">
                <div>
                  <dt className="text-neutral-500">Model</dt>
                  <dd className="font-mono text-[#05058a]">
                    {infResult.model}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Provider</dt>
                  <dd className="font-mono text-[#05058a]">
                    {shortAddr(infResult.providerAddress)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Verified</dt>
                  <dd>
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-medium ${
                        infResult.verified === true
                          ? "bg-emerald-100 text-emerald-700"
                          : infResult.verified === false
                            ? "bg-red-100 text-red-700"
                            : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {infResult.verified === true
                        ? "verified"
                        : infResult.verified === false
                          ? "failed"
                          : "n/a"}
                    </span>
                  </dd>
                </div>
                {infResult.attestation ? (
                  <div>
                    <dt className="text-neutral-500">Attestation</dt>
                    <dd className="break-all font-mono text-[10px]">
                      {infResult.attestation.slice(0, 80)}…
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-2">
                <dt className="text-neutral-500">Output</dt>
                <dd className="mt-1 whitespace-pre-wrap border border-neutral-200 bg-white p-3 text-sm text-[#05058a]">
                  {infResult.output}
                </dd>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* ---- RIGHT COLUMN: Provider catalogue ---- */}
      <aside className="space-y-4 border border-neutral-200 bg-[#f5f5f0] p-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#05058a]/50">
            Provider catalogue
          </p>
          <h3 className="mt-2 text-base font-bold text-[#05058a]">
            Available models
          </h3>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 border border-neutral-300 px-2 py-1.5 text-xs"
            placeholder="Filter by model name…"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && refreshProviders()}
          />
          <button
            onClick={refreshProviders}
            disabled={!backendOnline}
            className="border border-[#05058a] px-3 py-1.5 text-xs text-[#05058a] disabled:opacity-40"
          >
            Search
          </button>
        </div>

        {providerError ? (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {providerError}
          </p>
        ) : null}

        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-500">Providers</span>
          <span className="font-medium text-[#05058a]">
            {providers.length}
          </span>
        </div>

        <div className="space-y-2">
          {providers.length > 0 ? (
            providers.map((p, idx) => (
              <button
                key={`${p.provider}-${idx}`}
                type="button"
                onClick={() => setSelectedProvider(p.provider)}
                className={`block w-full border p-3 text-left text-[11px] transition-colors ${
                  selectedProvider === p.provider
                    ? "border-[#05058a] bg-white"
                    : "border-neutral-200 bg-white hover:border-[#05058a]/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[#05058a]">{p.model}</p>
                  {p.teeSignerAcknowledged ? (
                    <span className="bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                      TEE ✓
                    </span>
                  ) : (
                    <span className="bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-500">
                      unack
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-neutral-500">
                  {shortAddr(p.provider)}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-neutral-500">
                  <span>{p.verifiability}</span>
                  <span>in: {p.inputPrice}</span>
                  <span>out: {p.outputPrice}</span>
                </div>
              </button>
            ))
          ) : (
            <p className="border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
              No providers found.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
