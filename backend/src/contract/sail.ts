/**
 * SAIL contract adapter (viem).
 *
 * Wraps the deployed SAIL contract on Ethereum Sepolia. All commit/execute/slash
 * calls flow through here. The operator's wallet (OPERATOR_PRIVATE_KEY) signs
 * commit + execute. Auditors sign their own slash transactions client-side.
 */

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAbiItem,
  getAddress,
  http,
  type Address,
  type Hex,
  parseAbi,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import { env } from "../config/env.js";

export const SAIL_ABI = parseAbi([
  // Errors
  "error SAIL__NotOwner()",
  "error SAIL__AlreadyRegistered()",
  "error SAIL__InsufficientStake()",
  "error SAIL__AgentNotActive()",
  "error SAIL__CommitmentNotFound()",
  "error SAIL__AlreadyExecuted()",
  "error SAIL__NonceMismatch()",
  "error SAIL__NotAuthorizedAuditor()",
  "error SAIL__CommitmentAlreadyExists()",
  "error SAIL__TransferFailed()",
  "error SAIL__NotAgentOperator()",
  "error SAIL__NoAuditors()",
  "function register(string ens, uint8 tier, address[] auditors) external payable",
  "function addStake(string ens) external payable",
  "function updateAuditors(string ens, address[] auditors) external",
  "function commit(string ens, bytes32 commitmentHash, bytes32 inputHash, string cid) external",
  "function execute(string ens, bytes32 commitmentHash) external",
  "function slash(string ens) external",
  "function isAuthorized(address auditor, string ens) external view returns (bool)",
  "function getAgent(string ens) external view returns ((address wallet, uint256 stake, uint8 tier, bool active, address[] auditors, uint256 commitmentCount, uint256 slashCount))",
  "function getCommitment(bytes32 commitmentHash) external view returns ((bytes32 inputHash, bytes32 commitmentHash, string cid, uint256 nonce, uint256 timestamp, bool executed))",
  "function getNonce(string ens) external view returns (uint256)",
  "function getAuditors(string ens) external view returns (address[])",
  "event AgentRegistered(string indexed ens, address indexed wallet, uint8 tier, uint256 stake)",
  "event CommitmentPosted(string indexed ens, bytes32 indexed commitmentHash, string cid, uint256 nonce)",
  "event ExecutionCleared(string indexed ens, bytes32 indexed commitmentHash)",
  "event AgentSlashed(string indexed ens, address indexed auditor, uint256 stakeSlashed)",
]);

export const SAIL_ADDRESS = env.sail.contractAddress as Address;

const operatorAccount = privateKeyToAccount(
  (env.sail.operatorKey.startsWith("0x") ? env.sail.operatorKey : `0x${env.sail.operatorKey}`) as Hex,
);

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(env.sail.rpcUrl),
});

export const operatorClient = createWalletClient({
  account: operatorAccount,
  chain: sepolia,
  transport: http(env.sail.rpcUrl),
});

export const operatorAddress = operatorAccount.address;

// ----- Reads -----

export async function getAgent(ens: string) {
  return publicClient.readContract({
    address: SAIL_ADDRESS,
    abi: SAIL_ABI,
    functionName: "getAgent",
    args: [ens],
  });
}

export async function getCommitment(commitmentHash: Hex) {
  return publicClient.readContract({
    address: SAIL_ADDRESS,
    abi: SAIL_ABI,
    functionName: "getCommitment",
    args: [commitmentHash],
  });
}

const commitmentPostedEvent = getAbiItem({
  abi: SAIL_ABI,
  name: "CommitmentPosted",
});

/** All CommitmentPosted logs for this ENS (includes tx hash per post). */
export async function getCommitmentPostedLogsForEns(ens: string) {
  return publicClient.getLogs({
    address: SAIL_ADDRESS,
    event: commitmentPostedEvent,
    args: { ens },
    fromBlock: env.sail.logsFromBlock,
    toBlock: "latest",
  });
}

function agentWalletIsEmpty(wallet: Address) {
  try {
    return getAddress(wallet) === zeroAddress;
  } catch {
    return true;
  }
}

/** Trim + ENSIP-15 normalize when possible; fall back to raw trim. */
export function resolveEnsInput(ensInput: string): { raw: string; canonical: string } {
  const raw = ensInput.trim();
  if (!raw) throw new Error("ens required");
  try {
    return { raw, canonical: normalize(raw) };
  } catch {
    return { raw, canonical: raw };
  }
}

async function mergeCommitmentPostedLogsForVariants(variants: string[]) {
  const uniq = [...new Set(variants.filter(Boolean))];
  const merged: Awaited<ReturnType<typeof getCommitmentPostedLogsForEns>> = [];
  const seen = new Set<string>();
  for (const v of uniq) {
    try {
      const chunk = await getCommitmentPostedLogsForEns(v);
      for (const log of chunk) {
        const k = `${log.transactionHash}-${log.logIndex}`;
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(log);
      }
    } catch (err) {
      console.warn(
        `[sail] CommitmentPosted getLogs failed for "${v}":`,
        (err as Error).message,
      );
    }
  }
  return merged;
}

/** Fallback when indexed-string filters miss: scan logs and match decoded ENS (RPC / topic quirks). */
async function scanCommitmentPostedMatchingEns(ensCandidates: Set<string>) {
  const all = await publicClient.getLogs({
    address: SAIL_ADDRESS,
    event: commitmentPostedEvent,
    fromBlock: env.sail.logsFromBlock,
    toBlock: "latest",
  });
  const matched: typeof all = [];
  for (const log of all) {
    try {
      const decoded = decodeEventLog({
        abi: SAIL_ABI,
        data: log.data,
        topics: [...log.topics] as [Hex, ...Hex[]],
        eventName: "CommitmentPosted",
        strict: true,
      });
      const e = decoded.args.ens as string;
      if (ensCandidates.has(e)) matched.push(log);
    } catch {
      continue;
    }
  }
  return matched;
}

export type CommitmentPostedRow = {
  txHash: Hex;
  blockNumber: string;
  logIndex: string;
  commitmentHash: Hex;
  cid: string;
  nonce: string;
  inputHash: Hex;
  timestamp: string;
  executed: boolean;
};

/** Decode log + merge current on-chain commitment row (executed, timestamp, inputHash). */
export async function enrichCommitmentPostedLog(log: {
  data: Hex;
  topics: readonly Hex[];
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
}): Promise<CommitmentPostedRow> {
  const decoded = decodeEventLog({
    abi: SAIL_ABI,
    data: log.data,
    topics: [...log.topics] as [Hex, ...Hex[]],
    eventName: "CommitmentPosted",
    strict: true,
  });
  const commitmentHash = decoded.args.commitmentHash as Hex;
  const onchain = await getCommitment(commitmentHash);
  const row = onchain as {
    inputHash: Hex;
    commitmentHash: Hex;
    cid: string;
    nonce: bigint;
    timestamp: bigint;
    executed: boolean;
  };
  return {
    txHash: log.transactionHash,
    blockNumber: log.blockNumber.toString(),
    logIndex: String(log.logIndex),
    commitmentHash,
    cid: decoded.args.cid,
    nonce: decoded.args.nonce.toString(),
    inputHash: row.inputHash,
    timestamp: row.timestamp.toString(),
    executed: row.executed,
  };
}

/** Agent ENS history: every CommitmentPosted tx, with fields needed to pick an audit target. */
export async function listCommitmentsForAgent(ensInput: string) {
  const { raw, canonical } = resolveEnsInput(ensInput);

  // Same resolution order as /api/axl/discover: try the exact input first, then ENSIP-15 canonical.
  const candidateKeys = [...new Set([raw, canonical].filter(Boolean))];
  let resolvedKey = candidateKeys[0] ?? raw;
  let agent = await getAgent(resolvedKey);
  let a = agent as {
    wallet: Address;
    stake: bigint;
    tier: number;
    active: boolean;
    auditors: Address[];
    commitmentCount: bigint;
    slashCount: bigint;
  };

  if (agentWalletIsEmpty(a.wallet) && candidateKeys.length > 1) {
    const alt = candidateKeys[1]!;
    agent = await getAgent(alt);
    a = agent as typeof a;
    resolvedKey = alt;
  }

  if (agentWalletIsEmpty(a.wallet)) {
    throw new Error("Agent not registered for this ENS");
  }

  const nonce = await getNonce(resolvedKey);
  let logs = await mergeCommitmentPostedLogsForVariants([resolvedKey, canonical, raw]);

  if (logs.length === 0 && a.commitmentCount > 0n) {
    try {
      logs = await scanCommitmentPostedMatchingEns(new Set([resolvedKey, canonical, raw]));
    } catch (err) {
      const hint =
        env.sail.logsFromBlock === 0n
          ? " Set SAIL_LOGS_FROM_BLOCK to the deployment block (or a recent height) if your RPC rejects wide getLogs."
          : "";
      throw new Error(`${(err as Error).message}${hint}`);
    }
  }

  const sorted = [...logs].sort((x, y) => {
    if (x.blockNumber < y.blockNumber) return -1;
    if (x.blockNumber > y.blockNumber) return 1;
    return x.logIndex - y.logIndex;
  });
  // Avoid dozens of parallel eth_call — many providers rate-limit and return RPC errors.
  const commitments: CommitmentPostedRow[] = [];
  for (const log of sorted) {
    commitments.push(await enrichCommitmentPostedLog(log));
  }
  return { agent: a, nonce, commitments, resolvedEns: resolvedKey };
}

export async function getNonce(ens: string): Promise<bigint> {
  return publicClient.readContract({
    address: SAIL_ADDRESS,
    abi: SAIL_ABI,
    functionName: "getNonce",
    args: [ens],
  });
}

export async function isAuthorized(auditor: Address, ens: string): Promise<boolean> {
  return publicClient.readContract({
    address: SAIL_ADDRESS,
    abi: SAIL_ABI,
    functionName: "isAuthorized",
    args: [auditor, ens],
  });
}

// ----- Writes (signed by operator wallet) -----

export async function register(
  ens: string,
  tier: 0 | 1 | 2,
  auditors: Address[],
  stakeWei: bigint,
): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    address: SAIL_ADDRESS,
    abi: SAIL_ABI,
    functionName: "register",
    args: [ens, tier, auditors],
    account: operatorAccount,
    value: stakeWei,
  });
  return operatorClient.writeContract(request);
}

export async function commit(
  ens: string,
  commitmentHash: Hex,
  inputHash: Hex,
  cid: string,
): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    address: SAIL_ADDRESS,
    abi: SAIL_ABI,
    functionName: "commit",
    args: [ens, commitmentHash, inputHash, cid],
    account: operatorAccount,
  });
  return operatorClient.writeContract(request);
}

export async function execute(ens: string, commitmentHash: Hex): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    address: SAIL_ADDRESS,
    abi: SAIL_ABI,
    functionName: "execute",
    args: [ens, commitmentHash],
    account: operatorAccount,
  });
  return operatorClient.writeContract(request);
}

export async function waitForReceipt(hash: Hex) {
  return publicClient.waitForTransactionReceipt({ hash });
}
