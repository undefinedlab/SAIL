export type OperatorAgentRegistration = {
  agentIdBytes32: `0x${string}`;
  runtimeHash: string;
  stakeEth: string;
  registerTxHash?: `0x${string}`;
  agentProfile: string;
  registeredAt: number;
};

const STORAGE_KEY = "seal_operator_agent";

export function loadOperatorAgent(): OperatorAgentRegistration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OperatorAgentRegistration;
  } catch {
    return null;
  }
}

export function saveOperatorAgent(reg: OperatorAgentRegistration) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reg));
}
