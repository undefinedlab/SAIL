import { parseAbi } from "viem";

/** Aligned with `contracts/src/SEAL.sol` + `backend/src/contract-integration.ts` */
export const sealAbi = parseAbi([
  "function registerAgent(bytes32 agentId) payable",
  "function minStake() view returns (uint256)",
  "function agents(bytes32 agentId) view returns (bool registered, uint256 nonce, uint256 stake, bool slashed, address agentOwner)",
  "function getAgentTasks(bytes32 agentId) view returns (bytes32[])",
  "function commitmentCount() view returns (uint256)",
  "function executionCount() view returns (uint256)",
  "function disputeCount() view returns (uint256)",
  "function disputeBond() view returns (uint256)",
  "function disputePeriod() view returns (uint256)",
  "function registeredAgentCount() view returns (uint256)",
  "function registeredAgentAt(uint256 index) view returns (bytes32)",
  "function getRegisteredAgents() view returns (bytes32[])",
  "function owner() view returns (address)",
  "function getCommitment(bytes32 taskId) view returns (bool committed, bool executed, bytes32 merkleRoot, uint256 nonce, uint256 timestamp, address submitter, bytes32 executionHash)",
  "function submitCommitment(bytes32 taskId, bytes32 merkleRoot, bytes attestationQuote, uint256 nonce, uint256 timestamp, bytes32 agentId)",
  "function executeTask(bytes32 taskId, bytes txData, bytes32 executionHash, bytes signature)",
]);
