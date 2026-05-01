"use client";

import { useEffect, useState } from "react";
import {
  attestInputs,
  commitToSail,
  executeCommitment,
  getAgent,
  healthCheck,
  reason,
  type CommitResponse,
} from "@/lib/sail-api";
import { TIER_LABELS } from "@/lib/sail-abi";

type AgentSummary = {
  wallet: string;
  stake: string;
  tier: number;
  active: boolean;
  commitmentCount: string;
  slashCount: string;
  nonce: string;
};

export function SailOperatorPanel() {
  const [agentEns, setAgentEns] = useState("");
  const [inputs, setInputs] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a treasury manager. Reply with a single concise decision.",
  );
  const [useZkTier, setUseZkTier] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inputHash, setInputHash] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<{
    output: string;
    model: string;
    attestation?: string;
  } | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [executeTxHash, setExecuteTxHash] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    healthCheck()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  async function refreshAgent() {
    if (!agentEns.trim()) return;
    try {
      const r = await getAgent(agentEns.trim());
      setAgent({
        wallet: r.agent.wallet,
        stake: r.agent.stake,
        tier: r.agent.tier,
        active: r.agent.active,
        commitmentCount: r.agent.commitmentCount,
        slashCount: r.agent.slashCount,
        nonce: r.nonce,
      });
    } catch (e) {
      setAgent(null);
    }
  }

  async function runPipeline() {
    setBusy(true);
    setError(null);
    setStatus("");
    setInputHash(null);
    setReasoning(null);
    setCommitResult(null);
    setExecuteTxHash(null);

    try {
      if (!agentEns.trim()) throw new Error("Agent ENS required");
      if (!inputs.trim()) throw new Error("Inputs required");

      // 01 attest
      setStatus("01 — attesting inputs");
      const attest = await attestInputs(inputs);
      setInputHash(attest.inputHash);

      // 02 reason (optional ZK tier)
      let attestation: string | undefined;
      let decision = inputs;
      if (useZkTier) {
        setStatus("02 — running 0G Compute sealed inference");
        const r = await reason(inputs, systemPrompt);
        decision = r.output;
        attestation = r.attestation;
        setReasoning({ output: r.output, model: r.model, attestation: r.attestation });
      }

      // 03 commit
      setStatus("03 — encrypting via Lit, uploading to 0G Storage, anchoring on-chain");
      const commit = await commitToSail({
        agentEns: agentEns.trim(),
        inputHash: attest.inputHash,
        decision,
        proposedAction: "0xPLACEHOLDER_CALLDATA",
        attestation,
      });
      setCommitResult(commit);

      // 04 execute
      setStatus("04 — clearing execute gate");
      const exec = await executeCommitment(agentEns.trim(), commit.commitmentHash);
      setExecuteTxHash(exec.txHash);

      setStatus("complete");
      await refreshAgent();
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 text-sm">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">SAIL Operator Console</h2>
        <p className="text-neutral-500">
          Backend status:{" "}
          <span
            className={
              backendOk === true
                ? "text-emerald-600"
                : backendOk === false
                  ? "text-red-600"
                  : "text-neutral-500"
            }
          >
            {backendOk === null ? "checking…" : backendOk ? "online" : "offline"}
          </span>
        </p>
      </header>

      <section className="space-y-3 rounded border border-neutral-200 p-4">
        <h3 className="font-medium">Agent</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-neutral-300 px-2 py-1"
            placeholder="myagent.sail.eth"
            value={agentEns}
            onChange={(e) => setAgentEns(e.target.value)}
          />
          <button
            type="button"
            onClick={refreshAgent}
            className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50"
          >
            Lookup
          </button>
        </div>

        {agent && (
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-neutral-500">Wallet</dt>
              <dd className="font-mono break-all">{agent.wallet}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Active</dt>
              <dd>{agent.active ? "yes" : "no (slashed or unregistered)"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Tier</dt>
              <dd>{TIER_LABELS[agent.tier] ?? "unknown"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Stake (wei)</dt>
              <dd className="font-mono">{agent.stake}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Commitments</dt>
              <dd>{agent.commitmentCount}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Slashes</dt>
              <dd>{agent.slashCount}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Current nonce</dt>
              <dd>{agent.nonce}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="space-y-3 rounded border border-neutral-200 p-4">
        <h3 className="font-medium">Run Pipeline</h3>
        <textarea
          className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
          rows={4}
          placeholder="Inputs (free text or JSON). Hashed and locked into the commitment."
          value={inputs}
          onChange={(e) => setInputs(e.target.value)}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={useZkTier}
            onChange={(e) => setUseZkTier(e.target.checked)}
          />
          <span>Use ZK tier (route reasoning through 0G Compute sealed inference)</span>
        </label>
        {useZkTier && (
          <input
            className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
            placeholder="System prompt for the reasoning model"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        )}
        <button
          type="button"
          onClick={runPipeline}
          disabled={busy || backendOk !== true}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "running…" : "Run attest → reason → commit → execute"}
        </button>
        {status && <p className="text-xs text-neutral-600">{status}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </section>

      {(inputHash || reasoning || commitResult || executeTxHash) && (
        <section className="space-y-2 rounded border border-neutral-200 p-4 text-xs">
          <h3 className="font-medium">Pipeline Output</h3>
          {inputHash && (
            <p>
              <span className="text-neutral-500">Input hash:</span>{" "}
              <span className="font-mono break-all">{inputHash}</span>
            </p>
          )}
          {reasoning && (
            <>
              <p>
                <span className="text-neutral-500">Model:</span>{" "}
                <span className="font-mono">{reasoning.model}</span>
              </p>
              <p>
                <span className="text-neutral-500">Output:</span>{" "}
                <span className="font-mono">{reasoning.output}</span>
              </p>
              <p>
                <span className="text-neutral-500">0G attestation:</span>{" "}
                <span className="font-mono break-all">
                  {reasoning.attestation ? reasoning.attestation.slice(0, 80) + "…" : "(none)"}
                </span>
              </p>
            </>
          )}
          {commitResult && (
            <>
              <p>
                <span className="text-neutral-500">Commitment hash:</span>{" "}
                <span className="font-mono break-all">{commitResult.commitmentHash}</span>
              </p>
              <p>
                <span className="text-neutral-500">0G Storage CID:</span>{" "}
                <span className="font-mono break-all">{commitResult.cid}</span>
              </p>
              <p>
                <span className="text-neutral-500">Commit tx:</span>{" "}
                <a
                  className="text-blue-600 underline font-mono"
                  href={`https://sepolia.etherscan.io/tx/${commitResult.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {commitResult.txHash}
                </a>
              </p>
            </>
          )}
          {executeTxHash && (
            <p>
              <span className="text-neutral-500">Execute tx:</span>{" "}
              <a
                className="text-blue-600 underline font-mono"
                href={`https://sepolia.etherscan.io/tx/${executeTxHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {executeTxHash}
              </a>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
