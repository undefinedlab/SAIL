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
  http,
  type Address,
  type Hex,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { env } from "../config/env.js";

export const SAIL_ABI = parseAbi([
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
