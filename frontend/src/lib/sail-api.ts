/**
 * Thin client for the SAIL backend HTTP API.
 * Defaults to same-origin (proxied via next.config.mjs rewrites).
 */

import { sailApiBase } from "./wagmi-config";

function url(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sailApiBase ? `${sailApiBase}${p}` : p;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "error" in (body as Record<string, unknown>)
        ? String((body as Record<string, unknown>).error)
        : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

// Health
export async function healthCheck() {
  return jsonRequest<{
    ok: boolean;
    contract: string;
    operator: string;
    chainId: number;
    timestamp: string;
  }>("/health");
}

// Reads
export async function getAgent(ens: string) {
  return jsonRequest<{
    agent: {
      wallet: string;
      stake: string;
      tier: number;
      active: boolean;
      auditors: string[];
      commitmentCount: string;
      slashCount: string;
    };
    nonce: string;
  }>(`/api/agents/${encodeURIComponent(ens)}`);
}

export async function getCommitment(hash: string) {
  return jsonRequest<{
    commitment: {
      inputHash: string;
      commitmentHash: string;
      cid: string;
      nonce: string;
      timestamp: string;
      executed: boolean;
    };
  }>(`/api/commitments/${hash}`);
}

// Pipeline
export type AttestResponse = { inputHash: `0x${string}`; timestamp: number };

export async function attestInputs(inputs: unknown): Promise<AttestResponse> {
  return jsonRequest("/api/attest", {
    method: "POST",
    body: JSON.stringify({ inputs }),
  });
}

export type ReasonResponse = {
  output: string;
  attestation?: string;
  model: string;
  providerAddress: string;
};

export async function reason(prompt: string, systemPrompt?: string): Promise<ReasonResponse> {
  return jsonRequest("/api/reason", {
    method: "POST",
    body: JSON.stringify({ prompt, systemPrompt }),
  });
}

export type CommitResponse = {
  commitmentHash: `0x${string}`;
  cid: string;
  nonce: string;
  txHash: `0x${string}`;
};

export async function commitToSail(input: {
  agentEns: string;
  inputHash: string;
  decision: string;
  proposedAction: string;
  attestation?: string;
}): Promise<CommitResponse> {
  return jsonRequest("/api/commit", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ExecuteResponse = {
  txHash: `0x${string}`;
  commitmentHash: `0x${string}`;
};

export async function executeCommitment(
  agentEns: string,
  commitmentHash: string,
): Promise<ExecuteResponse> {
  return jsonRequest("/api/execute", {
    method: "POST",
    body: JSON.stringify({ agentEns, commitmentHash }),
  });
}

// Audit
export type SealedBlobResponse = {
  ciphertext: string;
  dataToEncryptHash: string;
  accessConditions: unknown;
};

export async function fetchSealedBlob(cid: string): Promise<SealedBlobResponse> {
  return jsonRequest(`/api/reveal/${encodeURIComponent(cid)}`);
}
