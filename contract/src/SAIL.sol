// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title SAIL — Secure Agentic Intelligence Layer
/// @notice Commit-before-execute enforcement and cryptographic accountability for AI agents.
/// @dev Agents must post a commitment on-chain before any execution is permitted.
///      Authorized auditors can verify the commitment chain and slash misbehaving agents.
///      Encrypted commitment blobs are stored on 0G Storage; CIDs are anchored here.
///      Lit Protocol queries isAuthorized() before decrypting any blob.
contract SAIL is ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Caller is not the contract owner.
    error SAIL__NotOwner();

    /// @notice An agent with this ENS name is already registered.
    error SAIL__AlreadyRegistered();

    /// @notice Stake sent is below the required minimum.
    error SAIL__InsufficientStake();

    /// @notice The referenced agent is not active (deregistered or slashed).
    error SAIL__AgentNotActive();

    /// @notice No commitment found for the given commitment hash.
    error SAIL__CommitmentNotFound();

    /// @notice This commitment has already been used for execution.
    error SAIL__AlreadyExecuted();

    /// @notice The commitment nonce does not precede the current agent nonce.
    error SAIL__NonceMismatch();

    /// @notice Caller is not an authorized auditor for this agent.
    error SAIL__NotAuthorizedAuditor();

    /// @notice A commitment with this hash already exists.
    error SAIL__CommitmentAlreadyExists();

    /// @notice ETH transfer failed.
    error SAIL__TransferFailed();

    /// @notice Caller is not the registered wallet for this agent.
    error SAIL__NotAgentOperator();

    /// @notice Cannot have zero auditors.
    error SAIL__NoAuditors();

    // -------------------------------------------------------------------------
    // Type declarations
    // -------------------------------------------------------------------------

    /// @notice Trust tier declared at registration.
    /// @dev Optimistic: audit-on-request only.
    ///      ZK: 0G Compute sealed inference attestation included in commitment blob.
    ///      TEE: hardware attestation.
    enum Tier {
        Optimistic,
        ZK,
        TEE
    }

    /// @notice On-chain record for a registered AI agent.
    struct Agent {
        /// @notice The wallet address that registered this agent.
        address wallet;
        /// @notice Locked ETH stake. Slashed on proven mismatch.
        uint256 stake;
        /// @notice Declared trust tier.
        Tier tier;
        /// @notice Whether the agent is currently active.
        bool active;
        /// @notice Addresses authorized to request audits and trigger slashing.
        address[] auditors;
        /// @notice Total number of successfully executed commitments.
        uint256 commitmentCount;
        /// @notice Total number of times this agent has been slashed.
        uint256 slashCount;
    }

    /// @notice On-chain record for a single agent commitment.
    struct Commitment {
        /// @notice SHA256 hash of all inputs the agent received before reasoning.
        bytes32 inputHash;
        /// @notice Hash of the full commitment blob (input + decision + action).
        bytes32 commitmentHash;
        /// @notice 0G Storage CID of the encrypted commitment blob.
        string cid;
        /// @notice Agent nonce at the time of commitment. Proves ordering vs execute.
        uint256 nonce;
        /// @notice Block timestamp when commitment was posted.
        uint256 timestamp;
        /// @notice Whether this commitment has been consumed by an execute call.
        bool executed;
    }

    // -------------------------------------------------------------------------
    // State variables
    // -------------------------------------------------------------------------

    /// @notice Minimum ETH stake required to register an agent.
    uint256 public constant MINIMUM_STAKE = 0.01 ether;

    /// @notice Contract deployer. Can perform admin actions.
    address public owner;

    /// @notice Registry of all agents, keyed by ENS name.
    mapping(string => Agent) public agents;

    /// @notice All commitments ever posted, keyed by commitment hash.
    mapping(bytes32 => Commitment) public commitments;

    /// @notice Current nonce per agent. Incremented on each commit.
    mapping(string => uint256) public nonces;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new agent is registered.
    event AgentRegistered(string indexed ens, address indexed wallet, Tier tier, uint256 stake);

    /// @notice Emitted when an agent adds more stake.
    event StakeAdded(string indexed ens, uint256 amount, uint256 newTotal);

    /// @notice Emitted when an agent's auditor list is updated.
    event AuditorsUpdated(string indexed ens, address[] auditors);

    /// @notice Emitted when a commitment is posted on-chain.
    event CommitmentPosted(string indexed ens, bytes32 indexed commitmentHash, string cid, uint256 nonce);

    /// @notice Emitted when an execution is cleared by the gate.
    event ExecutionCleared(string indexed ens, bytes32 indexed commitmentHash);

    /// @notice Emitted when an agent is slashed.
    event AgentSlashed(string indexed ens, address indexed auditor, uint256 stakeSlashed);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    /// @dev Reverts if caller is not the contract owner.
    modifier onlyOwner() {
        if (msg.sender != owner) revert SAIL__NotOwner();
        _;
    }

    /// @dev Reverts if the referenced agent is not active.
    modifier onlyActiveAgent(string calldata ens) {
        if (!agents[ens].active) revert SAIL__AgentNotActive();
        _;
    }

    /// @dev Reverts if caller is not the registered wallet for this agent.
    modifier onlyAgentOperator(string calldata ens) {
        if (agents[ens].wallet != msg.sender) revert SAIL__NotAgentOperator();
        _;
    }

    // -------------------------------------------------------------------------
    // Functions
    // -------------------------------------------------------------------------

    /// @notice Deploys the SAIL contract and sets the deployer as owner.
    constructor() {
        owner = msg.sender;
    }

    // --- External ---

    /// @notice Register a new AI agent with a stake and list of authorized auditors.
    /// @dev ENS name must be unique. Stake must meet MINIMUM_STAKE.
    ///      Auditor addresses are stored on-chain and queried by Lit Protocol
    ///      via isAuthorized() before decrypting any commitment blob.
    /// @param ens The ENS name for this agent (e.g. "myagent.sail.eth").
    /// @param tier The declared trust tier (Optimistic, ZK, or TEE).
    /// @param auditors Addresses authorized to audit and slash this agent. Cannot be empty.
    function register(
        string calldata ens,
        Tier tier,
        address[] calldata auditors
    ) external payable {
        if (agents[ens].wallet != address(0)) revert SAIL__AlreadyRegistered();
        if (msg.value < MINIMUM_STAKE) revert SAIL__InsufficientStake();
        if (auditors.length == 0) revert SAIL__NoAuditors();

        agents[ens] = Agent({
            wallet: msg.sender,
            stake: msg.value,
            tier: tier,
            active: true,
            auditors: auditors,
            commitmentCount: 0,
            slashCount: 0
        });

        nonces[ens] = 0;

        emit AgentRegistered(ens, msg.sender, tier, msg.value);
    }

    /// @notice Add more ETH stake to an existing active agent.
    /// @dev Only the registered operator wallet can top up stake.
    /// @param ens The ENS name of the agent.
    function addStake(
        string calldata ens
    ) external payable onlyActiveAgent(ens) onlyAgentOperator(ens) {
        if (msg.value == 0) revert SAIL__InsufficientStake();

        agents[ens].stake += msg.value;

        emit StakeAdded(ens, msg.value, agents[ens].stake);
    }

    /// @notice Update the authorized auditor list for an agent.
    /// @dev Only the registered operator wallet can update auditors.
    ///      Updating auditors also updates Lit Protocol access conditions
    ///      since Lit queries isAuthorized() dynamically at decrypt time.
    /// @param ens The ENS name of the agent.
    /// @param auditors New list of authorized auditor addresses. Cannot be empty.
    function updateAuditors(
        string calldata ens,
        address[] calldata auditors
    ) external onlyActiveAgent(ens) onlyAgentOperator(ens) {
        if (auditors.length == 0) revert SAIL__NoAuditors();

        agents[ens].auditors = auditors;

        emit AuditorsUpdated(ens, auditors);
    }

    /// @notice Post a commitment on-chain before execution.
    /// @dev The MCP server calls this after:
    ///      1. Sending the plaintext blob to Lit Protocol for encryption.
    ///      2. Writing the encrypted blob to 0G Storage and receiving a CID.
    ///      The CID anchors the blob. If anyone modifies the blob on 0G Storage,
    ///      the CID changes and no longer matches this on-chain anchor.
    /// @param ens The ENS name of the agent posting the commitment.
    /// @param commitmentHash SHA256 hash of the full commitment blob.
    /// @param inputHash SHA256 hash of all inputs the agent received before reasoning.
    /// @param cid 0G Storage CID of the encrypted commitment blob.
    function commit(
        string calldata ens,
        bytes32 commitmentHash,
        bytes32 inputHash,
        string calldata cid
    ) external onlyActiveAgent(ens) {
        if (commitments[commitmentHash].commitmentHash == commitmentHash)
            revert SAIL__CommitmentAlreadyExists();

        uint256 currentNonce = nonces[ens];

        commitments[commitmentHash] = Commitment({
            inputHash: inputHash,
            commitmentHash: commitmentHash,
            cid: cid,
            nonce: currentNonce,
            timestamp: block.timestamp,
            executed: false
        });

        nonces[ens] = currentNonce + 1;

        emit CommitmentPosted(ens, commitmentHash, cid, currentNonce);
    }

    /// @notice Execution gate. Reverts unless a valid prior commitment exists.
    /// @dev Enforces three invariants atomically:
    ///      1. The commitment exists on-chain (was never fabricated post-hoc).
    ///      2. The commitment has not already been executed (no replay attacks).
    ///      3. The commitment nonce precedes the current nonce (was posted before this call).
    ///      Any failure reverts — no partial execution, no fallback path.
    /// @param ens The ENS name of the agent executing.
    /// @param commitmentHash The commitment hash that authorizes this execution.
    function execute(
        string calldata ens,
        bytes32 commitmentHash
    ) external onlyActiveAgent(ens) {
        Commitment storage c = commitments[commitmentHash];

        if (c.commitmentHash != commitmentHash) revert SAIL__CommitmentNotFound();
        if (c.executed) revert SAIL__AlreadyExecuted();
        if (c.nonce >= nonces[ens]) revert SAIL__NonceMismatch();

        c.executed = true;
        agents[ens].commitmentCount++;

        emit ExecutionCleared(ens, commitmentHash);
    }

    /// @notice Slash an agent whose commitment blob does not match its on-chain hash.
    /// @dev Off-chain process:
    ///      1. Auditor requests blob decryption from Lit Protocol.
    ///      2. Lit queries isAuthorized(auditor, ens) on this contract.
    ///      3. Auditor receives plaintext blob and computes SHA256.
    ///      4. If SHA256(plaintext) != on-chain commitmentHash → call this function.
    ///      On-chain: full stake transferred to auditor, agent permanently deactivated.
    ///      Follows checks-effects-interactions; reentrancy guard applied.
    /// @param ens The ENS name of the agent to slash.
    function slash(string calldata ens) external nonReentrant onlyActiveAgent(ens) {
        if (!isAuthorized(msg.sender, ens)) revert SAIL__NotAuthorizedAuditor();

        Agent storage agent = agents[ens];
        uint256 stakeAmount = agent.stake;

        agent.stake = 0;
        agent.active = false;
        agent.slashCount++;

        (bool success,) = payable(msg.sender).call{value: stakeAmount}("");
        if (!success) revert SAIL__TransferFailed();

        emit AgentSlashed(ens, msg.sender, stakeAmount);
    }

    // --- View & Pure ---

    /// @notice Check whether an address is an authorized auditor for a given agent.
    /// @dev Called by Lit Protocol nodes at decrypt time to enforce access conditions.
    ///      Also called internally by slash() before executing.
    /// @param auditor The address to check.
    /// @param ens The ENS name of the agent.
    /// @return bool True if the address is an authorized auditor.
    function isAuthorized(address auditor, string calldata ens) public view returns (bool) {
        address[] storage auditors = agents[ens].auditors;
        for (uint256 i = 0; i < auditors.length; i++) {
            if (auditors[i] == auditor) return true;
        }
        return false;
    }

    /// @notice Return the full Agent record for a given ENS name.
    /// @param ens The ENS name of the agent.
    /// @return Agent The full agent struct.
    function getAgent(string calldata ens) external view returns (Agent memory) {
        return agents[ens];
    }

    /// @notice Return the full Commitment record for a given commitment hash.
    /// @param commitmentHash The commitment hash to look up.
    /// @return Commitment The full commitment struct.
    function getCommitment(bytes32 commitmentHash) external view returns (Commitment memory) {
        return commitments[commitmentHash];
    }

    /// @notice Return the current nonce for a given agent.
    /// @dev Nonce increments on every commit call. Used to prove commit precedes execute.
    /// @param ens The ENS name of the agent.
    /// @return uint256 The current nonce.
    function getNonce(string calldata ens) external view returns (uint256) {
        return nonces[ens];
    }

    /// @notice Return the auditor list for a given agent.
    /// @param ens The ENS name of the agent.
    /// @return address[] The list of authorized auditor addresses.
    function getAuditors(string calldata ens) external view returns (address[] memory) {
        return agents[ens].auditors;
    }
}
