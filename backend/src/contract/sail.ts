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
  decodeFunctionData,
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

// Publicnode and most free Sepolia RPCs limit eth_getLogs to 50,000 blocks per request.
// We start from a known recent block and chunk upward to avoid "exceed maximum block range".
const SAIL_DEPLOY_BLOCK = 10_600_000n;
const LOG_CHUNK_SIZE = 49_000n;

/** getLogs with automatic chunking to stay within provider's 50k-block limit. */
async function getLogsChunked(
  params: Parameters<typeof publicClient.getLogs>[0] & { fromBlock: bigint },
): Promise<Awaited<ReturnType<typeof publicClient.getLogs>>> {
  const latest = await publicClient.getBlockNumber();
  const results: Awaited<ReturnType<typeof publicClient.getLogs>> = [];
  let from = params.fromBlock;
  while (from <= latest) {
    const to = from + LOG_CHUNK_SIZE > latest ? latest : from + LOG_CHUNK_SIZE;
    const chunk = await publicClient.getLogs({ ...params, fromBlock: from, toBlock: to });
    results.push(...chunk);
    from = to + 1n;
  }
  return results;
}

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

/**
 * Resolve the agent ENS that posted this commitment by locating CommitmentPosted and
 * decoding `commit()` calldata (indexed `string ens` in the event is not recoverable from topics alone).
 */
export async function resolveEnsFromCommitmentHash(commitmentHash: Hex): Promise<string> {
  const logs = await getLogsChunked({
    address: SAIL_ADDRESS,
    event: commitmentPostedEvent,
    args: { commitmentHash },
    fromBlock: SAIL_DEPLOY_BLOCK,
  });
  if (logs.length === 0) {
    throw new Error("No CommitmentPosted event for this commitment hash");
  }
  const txHash = logs[0].transactionHash;
  if (txHash == null) {
    throw new Error("CommitmentPosted log missing transaction hash");
  }
  const tx = await publicClient.getTransaction({ hash: txHash });
  if (!tx?.input) {
    throw new Error("Could not load transaction for commitment");
  }
  const to = tx.to ? getAddress(tx.to) : null;
  if (!to || to !== getAddress(SAIL_ADDRESS)) {
    throw new Error("Commitment was not posted via direct SAIL contract call");
  }
  const decoded = decodeFunctionData({
    abi: SAIL_ABI,
    data: tx.input,
  });
  if (decoded.functionName !== "commit") {
    throw new Error(`Expected commit() call, got ${decoded.functionName}`);
  }
  const ens = decoded.args[0] as string;
  if (!ens?.trim()) {
    throw new Error("Could not decode agent ENS from commit transaction");
  }
  return ens.trim();
}

/** All CommitmentPosted logs for this ENS (includes tx hash per post). */
export async function getCommitmentPostedLogsForEns(ens: string) {
  return getLogsChunked({
    address: SAIL_ADDRESS,
    event: commitmentPostedEvent,
    args: { ens },
    fromBlock: SAIL_DEPLOY_BLOCK,
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
    const chunk = await getCommitmentPostedLogsForEns(v);
    for (const log of chunk) {
      const k = `${log.transactionHash}-${log.logIndex}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(log);
    }
  }
  return merged;
}

/** Fallback when indexed-string filters miss: scan logs and match decoded ENS (RPC / topic quirks). */
async function scanCommitmentPostedMatchingEns(ensCandidates: Set<string>) {
  const all = await getLogsChunked({
    address: SAIL_ADDRESS,
    event: commitmentPostedEvent,
    fromBlock: SAIL_DEPLOY_BLOCK,
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

/** Logs from RPC may omit tx hash / block / index until finalized; enrichment needs them. */
function isCommitmentPostedLogComplete(
  log: Awaited<ReturnType<typeof getLogsChunked>>[number],
): log is Awaited<ReturnType<typeof getLogsChunked>>[number] & {
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
} {
  return log.transactionHash != null && log.blockNumber != null && log.logIndex != null;
}

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

  let resolvedKey = canonical;
  let agent = await getAgent(canonical);
  let a = agent as {
    wallet: Address;
    stake: bigint;
    tier: number;
    active: boolean;
    auditors: Address[];
    commitmentCount: bigint;
    slashCount: bigint;
  };

  if (agentWalletIsEmpty(a.wallet) && raw !== canonical) {
    agent = await getAgent(raw);
    a = agent as typeof a;
    resolvedKey = raw;
  }

  if (agentWalletIsEmpty(a.wallet)) {
    throw new Error("Agent not registered for this ENS");
  }

  const nonce = await getNonce(resolvedKey);
  let logs = await mergeCommitmentPostedLogsForVariants([resolvedKey, canonical, raw]);

  if (logs.length === 0 && a.commitmentCount > 0n) {
    logs = await scanCommitmentPostedMatchingEns(new Set([resolvedKey, canonical, raw]));
  }

  const complete = logs.filter(isCommitmentPostedLogComplete);
  const sorted = [...complete].sort((x, y) => {
    if (x.blockNumber < y.blockNumber) return -1;
    if (x.blockNumber > y.blockNumber) return 1;
    return x.logIndex - y.logIndex;
  });
  const commitments = await Promise.all(sorted.map((log) => enrichCommitmentPostedLog(log)));
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
