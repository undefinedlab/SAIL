// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test, console} from "forge-std/Test.sol";
import {SAIL} from "../src/SAIL.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title SAIL Test Suite
/// @notice Comprehensive tests for all SAIL contract functions and invariants.
contract SAILTest is Test {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    SAIL public sail;

    address public owner;
    address public operator;
    address public auditor;
    address public stranger;

    string public constant ENS = "agent.sail.eth";
    uint256 public constant STAKE = 0.1 ether;

    bytes32 public constant INPUT_HASH = keccak256("inputs");
    bytes32 public constant COMMITMENT_HASH = keccak256("commitment");
    string public constant CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        owner = makeAddr("owner");
        operator = makeAddr("operator");
        auditor = makeAddr("auditor");
        stranger = makeAddr("stranger");

        vm.prank(owner);
        sail = new SAIL();

        vm.deal(operator, 10 ether);
        vm.deal(auditor, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _registerAgent() internal {
        address[] memory auditors = new address[](1);
        auditors[0] = auditor;

        vm.prank(operator);
        sail.register{value: STAKE}(ENS, SAIL.Tier.Optimistic, auditors);
    }

    function _registerAndCommit() internal {
        _registerAgent();

        vm.prank(operator);
        sail.commit(ENS, COMMITMENT_HASH, INPUT_HASH, CID);
    }

    function _registerCommitAndExecute() internal {
        _registerAndCommit();

        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    function test_constructor_setsOwner() public view {
        assertEq(sail.owner(), owner);
    }

    // -------------------------------------------------------------------------
    // register()
    // -------------------------------------------------------------------------

    function test_register_success() public {
        _registerAgent();

        SAIL.Agent memory agent = sail.getAgent(ENS);

        assertEq(agent.wallet, operator);
        assertEq(agent.stake, STAKE);
        assertEq(uint256(agent.tier), uint256(SAIL.Tier.Optimistic));
        assertTrue(agent.active);
        assertEq(agent.auditors[0], auditor);
        assertEq(agent.commitmentCount, 0);
        assertEq(agent.slashCount, 0);
    }

    function test_register_emitsEvent() public {
        address[] memory auditors = new address[](1);
        auditors[0] = auditor;

        vm.expectEmit(true, true, false, true);
        emit SAIL.AgentRegistered(ENS, operator, SAIL.Tier.Optimistic, STAKE);

        vm.prank(operator);
        sail.register{value: STAKE}(ENS, SAIL.Tier.Optimistic, auditors);
    }

    function test_register_setsNonceToZero() public {
        _registerAgent();
        assertEq(sail.getNonce(ENS), 0);
    }

    function test_register_revertsIfAlreadyRegistered() public {
        _registerAgent();

        address[] memory auditors = new address[](1);
        auditors[0] = auditor;

        vm.expectRevert(SAIL.SAIL__AlreadyRegistered.selector);
        vm.prank(operator);
        sail.register{value: STAKE}(ENS, SAIL.Tier.Optimistic, auditors);
    }

    function test_register_revertsIfInsufficientStake() public {
        address[] memory auditors = new address[](1);
        auditors[0] = auditor;

        vm.expectRevert(SAIL.SAIL__InsufficientStake.selector);
        vm.prank(operator);
        sail.register{value: 0.001 ether}(ENS, SAIL.Tier.Optimistic, auditors);
    }

    function test_register_revertsOnZeroStake() public {
        address[] memory auditors = new address[](1);
        auditors[0] = auditor;

        vm.expectRevert(SAIL.SAIL__InsufficientStake.selector);
        vm.prank(operator);
        sail.register{value: 0}(ENS, SAIL.Tier.Optimistic, auditors);
    }

    function test_register_revertsWithNoAuditors() public {
        address[] memory auditors = new address[](0);

        vm.expectRevert(SAIL.SAIL__NoAuditors.selector);
        vm.prank(operator);
        sail.register{value: STAKE}(ENS, SAIL.Tier.Optimistic, auditors);
    }

    function test_register_multipleAuditors() public {
        address auditor2 = makeAddr("auditor2");
        address[] memory auditors = new address[](2);
        auditors[0] = auditor;
        auditors[1] = auditor2;

        vm.prank(operator);
        sail.register{value: STAKE}(ENS, SAIL.Tier.ZK, auditors);

        SAIL.Agent memory agent = sail.getAgent(ENS);
        assertEq(agent.auditors.length, 2);
        assertEq(agent.auditors[1], auditor2);
    }

    function test_register_allTiers() public {
        address[] memory auditors = new address[](1);
        auditors[0] = auditor;

        address op2 = makeAddr("op2");
        address op3 = makeAddr("op3");
        vm.deal(op2, 1 ether);
        vm.deal(op3, 1 ether);

        vm.prank(operator);
        sail.register{value: STAKE}("opt.sail.eth", SAIL.Tier.Optimistic, auditors);

        vm.prank(op2);
        sail.register{value: STAKE}("zk.sail.eth", SAIL.Tier.ZK, auditors);

        vm.prank(op3);
        sail.register{value: STAKE}("tee.sail.eth", SAIL.Tier.TEE, auditors);

        assertEq(uint256(sail.getAgent("opt.sail.eth").tier), uint256(SAIL.Tier.Optimistic));
        assertEq(uint256(sail.getAgent("zk.sail.eth").tier), uint256(SAIL.Tier.ZK));
        assertEq(uint256(sail.getAgent("tee.sail.eth").tier), uint256(SAIL.Tier.TEE));
    }

    // -------------------------------------------------------------------------
    // addStake()
    // -------------------------------------------------------------------------

    function test_addStake_success() public {
        _registerAgent();

        uint256 extra = 0.05 ether;

        vm.prank(operator);
        sail.addStake{value: extra}(ENS);

        assertEq(sail.getAgent(ENS).stake, STAKE + extra);
    }

    function test_addStake_emitsEvent() public {
        _registerAgent();

        uint256 extra = 0.05 ether;

        vm.expectEmit(true, false, false, true);
        emit SAIL.StakeAdded(ENS, extra, STAKE + extra);

        vm.prank(operator);
        sail.addStake{value: extra}(ENS);
    }

    function test_addStake_revertsIfNotOperator() public {
        _registerAgent();

        vm.expectRevert(SAIL.SAIL__NotAgentOperator.selector);
        vm.prank(stranger);
        sail.addStake{value: 0.05 ether}(ENS);
    }

    function test_addStake_revertsIfZeroValue() public {
        _registerAgent();

        vm.expectRevert(SAIL.SAIL__InsufficientStake.selector);
        vm.prank(operator);
        sail.addStake{value: 0}(ENS);
    }

    function test_addStake_revertsIfAgentNotActive() public {
        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(operator);
        sail.addStake{value: 0.05 ether}("unregistered.sail.eth");
    }

    // -------------------------------------------------------------------------
    // updateAuditors()
    // -------------------------------------------------------------------------

    function test_updateAuditors_success() public {
        _registerAgent();

        address newAuditor = makeAddr("newAuditor");
        address[] memory newAuditors = new address[](1);
        newAuditors[0] = newAuditor;

        vm.prank(operator);
        sail.updateAuditors(ENS, newAuditors);

        assertTrue(sail.isAuthorized(newAuditor, ENS));
        assertFalse(sail.isAuthorized(auditor, ENS));
    }

    function test_updateAuditors_emitsEvent() public {
        _registerAgent();

        address newAuditor = makeAddr("newAuditor");
        address[] memory newAuditors = new address[](1);
        newAuditors[0] = newAuditor;

        vm.expectEmit(true, false, false, false);
        emit SAIL.AuditorsUpdated(ENS, newAuditors);

        vm.prank(operator);
        sail.updateAuditors(ENS, newAuditors);
    }

    function test_updateAuditors_revertsIfNotOperator() public {
        _registerAgent();

        address[] memory newAuditors = new address[](1);
        newAuditors[0] = makeAddr("newAuditor");

        vm.expectRevert(SAIL.SAIL__NotAgentOperator.selector);
        vm.prank(stranger);
        sail.updateAuditors(ENS, newAuditors);
    }

    function test_updateAuditors_revertsIfEmpty() public {
        _registerAgent();

        address[] memory empty = new address[](0);

        vm.expectRevert(SAIL.SAIL__NoAuditors.selector);
        vm.prank(operator);
        sail.updateAuditors(ENS, empty);
    }

    function test_updateAuditors_oldAuditorCanNoLongerSlash() public {
        _registerAgent();

        address newAuditor = makeAddr("newAuditor");
        address[] memory newAuditors = new address[](1);
        newAuditors[0] = newAuditor;

        vm.prank(operator);
        sail.updateAuditors(ENS, newAuditors);

        vm.expectRevert(SAIL.SAIL__NotAuthorizedAuditor.selector);
        vm.prank(auditor);
        sail.slash(ENS);
    }

    // -------------------------------------------------------------------------
    // commit()
    // -------------------------------------------------------------------------

    function test_commit_success() public {
        _registerAgent();

        vm.prank(operator);
        sail.commit(ENS, COMMITMENT_HASH, INPUT_HASH, CID);

        SAIL.Commitment memory c = sail.getCommitment(COMMITMENT_HASH);

        assertEq(c.commitmentHash, COMMITMENT_HASH);
        assertEq(c.inputHash, INPUT_HASH);
        assertEq(c.cid, CID);
        assertEq(c.nonce, 0);
        assertFalse(c.executed);
        assertGt(c.timestamp, 0);
    }

    function test_commit_incrementsNonce() public {
        _registerAgent();
        assertEq(sail.getNonce(ENS), 0);

        vm.prank(operator);
        sail.commit(ENS, COMMITMENT_HASH, INPUT_HASH, CID);

        assertEq(sail.getNonce(ENS), 1);
    }

    function test_commit_emitsEvent() public {
        _registerAgent();

        vm.expectEmit(true, true, false, true);
        emit SAIL.CommitmentPosted(ENS, COMMITMENT_HASH, CID, 0);

        vm.prank(operator);
        sail.commit(ENS, COMMITMENT_HASH, INPUT_HASH, CID);
    }

    function test_commit_multipleCommitmentsSucceed() public {
        _registerAgent();

        bytes32 hash1 = keccak256("commit1");
        bytes32 hash2 = keccak256("commit2");

        vm.startPrank(operator);
        sail.commit(ENS, hash1, INPUT_HASH, CID);
        sail.commit(ENS, hash2, INPUT_HASH, CID);
        vm.stopPrank();

        assertEq(sail.getCommitment(hash1).nonce, 0);
        assertEq(sail.getCommitment(hash2).nonce, 1);
        assertEq(sail.getNonce(ENS), 2);
    }

    function test_commit_revertsIfAgentNotActive() public {
        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(operator);
        sail.commit("unregistered.sail.eth", COMMITMENT_HASH, INPUT_HASH, CID);
    }

    function test_commit_revertsIfDuplicateHash() public {
        _registerAndCommit();

        vm.expectRevert(SAIL.SAIL__CommitmentAlreadyExists.selector);
        vm.prank(operator);
        sail.commit(ENS, COMMITMENT_HASH, INPUT_HASH, CID);
    }

    // -------------------------------------------------------------------------
    // execute()
    // -------------------------------------------------------------------------

    function test_execute_success() public {
        _registerAndCommit();

        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);

        assertTrue(sail.getCommitment(COMMITMENT_HASH).executed);
        assertEq(sail.getAgent(ENS).commitmentCount, 1);
    }

    function test_execute_emitsEvent() public {
        _registerAndCommit();

        vm.expectEmit(true, true, false, false);
        emit SAIL.ExecutionCleared(ENS, COMMITMENT_HASH);

        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);
    }

    function test_execute_revertsIfNoCommitment() public {
        _registerAgent();

        vm.expectRevert(SAIL.SAIL__CommitmentNotFound.selector);
        vm.prank(operator);
        sail.execute(ENS, keccak256("nonexistent"));
    }

    function test_execute_revertsIfAlreadyExecuted() public {
        _registerCommitAndExecute();

        vm.expectRevert(SAIL.SAIL__AlreadyExecuted.selector);
        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);
    }

    function test_execute_revertsIfNoCommitAtAll() public {
        _registerAgent();

        vm.expectRevert(SAIL.SAIL__CommitmentNotFound.selector);
        vm.prank(operator);
        sail.execute(ENS, keccak256("never committed"));
    }

    function test_execute_revertsIfAgentNotActive() public {
        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(operator);
        sail.execute("unregistered.sail.eth", COMMITMENT_HASH);
    }

    function test_execute_sequentialCommitmentsAllClearable() public {
        _registerAgent();

        bytes32 h1 = keccak256("c1");
        bytes32 h2 = keccak256("c2");
        bytes32 h3 = keccak256("c3");

        vm.startPrank(operator);
        sail.commit(ENS, h1, INPUT_HASH, CID);
        sail.commit(ENS, h2, INPUT_HASH, CID);
        sail.commit(ENS, h3, INPUT_HASH, CID);

        sail.execute(ENS, h1);
        sail.execute(ENS, h2);
        sail.execute(ENS, h3);
        vm.stopPrank();

        assertEq(sail.getAgent(ENS).commitmentCount, 3);
    }

    // -------------------------------------------------------------------------
    // slash()
    // -------------------------------------------------------------------------

    function test_slash_success() public {
        _registerAgent();

        uint256 balanceBefore = auditor.balance;

        vm.prank(auditor);
        sail.slash(ENS);

        SAIL.Agent memory agent = sail.getAgent(ENS);
        assertFalse(agent.active);
        assertEq(agent.stake, 0);
        assertEq(agent.slashCount, 1);
        assertEq(auditor.balance, balanceBefore + STAKE);
    }

    function test_slash_emitsEvent() public {
        _registerAgent();

        vm.expectEmit(true, true, false, true);
        emit SAIL.AgentSlashed(ENS, auditor, STAKE);

        vm.prank(auditor);
        sail.slash(ENS);
    }

    function test_slash_transfersFullStakeToAuditor() public {
        _registerAgent();

        uint256 before = auditor.balance;
        vm.prank(auditor);
        sail.slash(ENS);

        assertEq(auditor.balance - before, STAKE);
    }

    function test_slash_revertsIfNotAuthorizedAuditor() public {
        _registerAgent();

        vm.expectRevert(SAIL.SAIL__NotAuthorizedAuditor.selector);
        vm.prank(stranger);
        sail.slash(ENS);
    }

    function test_slash_revertsIfAlreadySlashed() public {
        _registerAgent();

        vm.prank(auditor);
        sail.slash(ENS);

        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(auditor);
        sail.slash(ENS);
    }

    function test_slash_preventsSubsequentCommits() public {
        _registerAgent();

        vm.prank(auditor);
        sail.slash(ENS);

        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(operator);
        sail.commit(ENS, COMMITMENT_HASH, INPUT_HASH, CID);
    }

    function test_slash_preventsSubsequentExecute() public {
        _registerAndCommit();

        vm.prank(auditor);
        sail.slash(ENS);

        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);
    }

    function test_slash_preventsStakeTopUp() public {
        _registerAgent();

        vm.prank(auditor);
        sail.slash(ENS);

        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(operator);
        sail.addStake{value: 0.05 ether}(ENS);
    }

    // -------------------------------------------------------------------------
    // isAuthorized()
    // -------------------------------------------------------------------------

    function test_isAuthorized_returnsTrueForAuditor() public {
        _registerAgent();
        assertTrue(sail.isAuthorized(auditor, ENS));
    }

    function test_isAuthorized_returnsFalseForStranger() public {
        _registerAgent();
        assertFalse(sail.isAuthorized(stranger, ENS));
    }

    function test_isAuthorized_returnsFalseForUnregisteredAgent() public view {
        assertFalse(sail.isAuthorized(auditor, "nobody.sail.eth"));
    }

    // -------------------------------------------------------------------------
    // getAuditors()
    // -------------------------------------------------------------------------

    function test_getAuditors_returnsCorrectList() public {
        address[] memory auditors = new address[](2);
        auditors[0] = auditor;
        auditors[1] = stranger;

        vm.prank(operator);
        sail.register{value: STAKE}(ENS, SAIL.Tier.Optimistic, auditors);

        address[] memory returned = sail.getAuditors(ENS);
        assertEq(returned.length, 2);
        assertEq(returned[0], auditor);
        assertEq(returned[1], stranger);
    }

    // -------------------------------------------------------------------------
    // Reentrancy
    // -------------------------------------------------------------------------

    function test_slash_reentrancyProtected() public {
        // Deploy a malicious auditor contract that tries to reenter slash
        MaliciousAuditor attacker = new MaliciousAuditor(address(sail), ENS);
        vm.deal(address(attacker), 1 ether);

        address[] memory auditors = new address[](1);
        auditors[0] = address(attacker);

        vm.prank(operator);
        sail.register{value: STAKE}(ENS, SAIL.Tier.Optimistic, auditors);

        // Slash succeeds once; the reentrant call inside receive() is blocked by OZ ReentrancyGuard
        attacker.attack();

        // Agent inactive after one slash
        assertFalse(sail.getAgent(ENS).active);
        // slashCount is 1, not 2 — reentrancy blocked the second call
        assertEq(sail.getAgent(ENS).slashCount, 1);
    }

    // -------------------------------------------------------------------------
    // Full pipeline integration
    // -------------------------------------------------------------------------

    function test_fullPipeline_registerCommitExecute() public {
        _registerAgent();
        assertEq(sail.getNonce(ENS), 0);

        vm.prank(operator);
        sail.commit(ENS, COMMITMENT_HASH, INPUT_HASH, CID);
        assertEq(sail.getNonce(ENS), 1);
        assertFalse(sail.getCommitment(COMMITMENT_HASH).executed);

        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);
        assertTrue(sail.getCommitment(COMMITMENT_HASH).executed);
        assertEq(sail.getAgent(ENS).commitmentCount, 1);
    }

    function test_fullPipeline_commitBeforeExecuteEnforced() public {
        _registerAgent();

        vm.expectRevert(SAIL.SAIL__CommitmentNotFound.selector);
        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);
    }

    function test_fullPipeline_slashAfterCommitBeforeExecute() public {
        _registerAndCommit();

        vm.prank(auditor);
        sail.slash(ENS);

        vm.expectRevert(SAIL.SAIL__AgentNotActive.selector);
        vm.prank(operator);
        sail.execute(ENS, COMMITMENT_HASH);
    }

    function test_fullPipeline_multipleAgentsIndependent() public {
        address operator2 = makeAddr("operator2");
        address auditor2 = makeAddr("auditor2");
        vm.deal(operator2, 10 ether);

        address[] memory auditors1 = new address[](1);
        auditors1[0] = auditor;

        address[] memory auditors2 = new address[](1);
        auditors2[0] = auditor2;

        vm.prank(operator);
        sail.register{value: STAKE}("agent1.sail.eth", SAIL.Tier.Optimistic, auditors1);

        vm.prank(operator2);
        sail.register{value: STAKE}("agent2.sail.eth", SAIL.Tier.ZK, auditors2);

        bytes32 h1 = keccak256("a1");
        bytes32 h2 = keccak256("a2");

        vm.prank(operator);
        sail.commit("agent1.sail.eth", h1, INPUT_HASH, CID);

        vm.prank(operator2);
        sail.commit("agent2.sail.eth", h2, INPUT_HASH, CID);

        vm.prank(operator);
        sail.execute("agent1.sail.eth", h1);

        vm.prank(operator2);
        sail.execute("agent2.sail.eth", h2);

        // Slash agent1 — agent2 unaffected
        vm.prank(auditor);
        sail.slash("agent1.sail.eth");

        assertFalse(sail.getAgent("agent1.sail.eth").active);
        assertTrue(sail.getAgent("agent2.sail.eth").active);
    }

    // -------------------------------------------------------------------------
    // Fuzz tests
    // -------------------------------------------------------------------------

    function testFuzz_register_acceptsAnyStakeAboveMinimum(uint256 stakeAmount) public {
        stakeAmount = bound(stakeAmount, sail.MINIMUM_STAKE(), 5 ether);
        vm.deal(operator, stakeAmount);

        address[] memory auditors = new address[](1);
        auditors[0] = auditor;

        vm.prank(operator);
        sail.register{value: stakeAmount}(ENS, SAIL.Tier.Optimistic, auditors);

        assertEq(sail.getAgent(ENS).stake, stakeAmount);
    }

    function testFuzz_commit_uniqueHashesAllSucceed(bytes32 h1, bytes32 h2) public {
        vm.assume(h1 != h2);
        vm.assume(h1 != bytes32(0));
        vm.assume(h2 != bytes32(0));

        _registerAgent();

        vm.startPrank(operator);
        sail.commit(ENS, h1, INPUT_HASH, CID);
        sail.commit(ENS, h2, INPUT_HASH, CID);
        vm.stopPrank();

        assertEq(sail.getNonce(ENS), 2);
    }

    function testFuzz_addStake_accumulatesCorrectly(uint256 extra) public {
        extra = bound(extra, 1, 5 ether);
        vm.deal(operator, 10 ether + extra);

        _registerAgent();

        vm.prank(operator);
        sail.addStake{value: extra}(ENS);

        assertEq(sail.getAgent(ENS).stake, STAKE + extra);
    }
}

// -------------------------------------------------------------------------
// Helper contracts
// -------------------------------------------------------------------------

/// @dev Attempts to reenter slash() on receiving ETH from a slash call.
contract MaliciousAuditor {
    SAIL private immutable sail;
    string private ens;
    bool private attacked;

    constructor(address _sail, string memory _ens) {
        sail = SAIL(_sail);
        ens = _ens;
    }

    function attack() external {
        sail.slash(ens);
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            try sail.slash(ens) {} catch {}
        }
    }
}
