// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {SAIL} from "../src/SAIL.sol";

/// @title Slash
/// @notice Slashes an agent after verified commitment hash mismatch.
/// @dev Off-chain process before calling this script:
///      1. Request blob decryption from Lit Protocol for the commitment CID.
///      2. Lit queries isAuthorized(auditorAddress, ens) on the SAIL contract.
///      3. Receive plaintext blob and compute SHA256(plaintext).
///      4. Compare against on-chain commitmentHash via getCommitment().
///      5. If mismatch confirmed → run this script.
///
///      On execution: full stake transferred to auditor, agent permanently deactivated.
///
///      Required env vars:
///      PRIVATE_KEY     — auditor private key (must be in agent's auditor list)
///      SAIL_ADDRESS    — deployed SAIL contract address
///      AGENT_ENS       — ENS name of the agent to slash
///
/// forge script script/Slash.s.sol \
///   --broadcast --rpc-url eth_sepolia
contract Slash is Script {
    function run() external {
        uint256 auditorKey = vm.envUint("PRIVATE_KEY");
        address sailAddress = vm.envAddress("SAIL_ADDRESS");
        string memory ens = vm.envString("AGENT_ENS");
        address auditor = vm.addr(auditorKey);

        SAIL sail = SAIL(sailAddress);
        SAIL.Agent memory agentBefore = sail.getAgent(ens);

        require(agentBefore.active, "Agent already inactive");
        require(sail.isAuthorized(auditor, ens), "Not an authorized auditor");

        console.log("=== Slash Agent ===");
        console.log("Contract:         ", sailAddress);
        console.log("Agent:            ", ens);
        console.log("Auditor:          ", auditor);
        console.log("Stake to slash:   ", agentBefore.stake);
        console.log("Commitment count: ", agentBefore.commitmentCount);

        uint256 balanceBefore = auditor.balance;

        vm.startBroadcast(auditorKey);
        sail.slash(ens);
        vm.stopBroadcast();

        SAIL.Agent memory agentAfter = sail.getAgent(ens);

        console.log("Slashed.");
        console.log("Agent active:     ", agentAfter.active);
        console.log("Stake remaining:  ", agentAfter.stake);
        console.log("Slash count:      ", agentAfter.slashCount);
        console.log("Stake recovered:  ", auditor.balance - balanceBefore);
    }
}
