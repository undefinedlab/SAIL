import { parseAbi } from "viem";

/** Aligned with `contract/src/SAIL.sol` (deployed to Ethereum Sepolia). */
export const sailAbi = parseAbi([
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
  // Reads
  "function MINIMUM_STAKE() view returns (uint256)",
  "function owner() view returns (address)",
  "function isAuthorized(address auditor, string ens) view returns (bool)",
  "function getAgent(string ens) view returns ((address wallet, uint256 stake, uint8 tier, bool active, address[] auditors, uint256 commitmentCount, uint256 slashCount))",
  "function getCommitment(bytes32 commitmentHash) view returns ((bytes32 inputHash, bytes32 commitmentHash, string cid, uint256 nonce, uint256 timestamp, bool executed))",
  "function getNonce(string ens) view returns (uint256)",
  "function getAuditors(string ens) view returns (address[])",
  // Writes
  "function register(string ens, uint8 tier, address[] auditors) payable",
  "function addStake(string ens) payable",
  "function updateAuditors(string ens, address[] auditors)",
  "function commit(string ens, bytes32 commitmentHash, bytes32 inputHash, string cid)",
  "function execute(string ens, bytes32 commitmentHash)",
  "function slash(string ens)",
  // Events
  "event AgentRegistered(string indexed ens, address indexed wallet, uint8 tier, uint256 stake)",
  "event CommitmentPosted(string indexed ens, bytes32 indexed commitmentHash, string cid, uint256 nonce)",
  "event ExecutionCleared(string indexed ens, bytes32 indexed commitmentHash)",
  "event AgentSlashed(string indexed ens, address indexed auditor, uint256 stakeSlashed)",
]);

export type SailTier = 0 | 1 | 2;
export const TIER_LABELS = ["Optimistic", "ZK", "TEE"] as const;
