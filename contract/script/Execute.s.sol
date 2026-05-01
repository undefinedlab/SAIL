// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {SAIL} from "../src/SAIL.sol";

/// @title Execute
/// @notice Clears execution through the SAIL gate for a prior commitment.
/// @dev Contract reverts if no valid commitment exists for the given hash.
///      Called by the SAIL MCP server as part of the sail_execute() tool flow.
///
///      Required env vars:
///      PRIVATE_KEY         — operator private key
///      SAIL_ADDRESS        — deployed SAIL contract address
///      AGENT_ENS           — ENS name of the agent
///      COMMITMENT_HASH     — hex hash of the commitment to execute against
///
/// forge script script/Execute.s.sol \
///   --broadcast --rpc-url eth_sepolia
contract Execute is Script {
    function run() external {
        uint256 operatorKey = vm.envUint("PRIVATE_KEY");
        address sailAddress = vm.envAddress("SAIL_ADDRESS");
        string memory ens = vm.envString("AGENT_ENS");
        bytes32 commitmentHash = vm.envBytes32("COMMITMENT_HASH");

        SAIL sail = SAIL(sailAddress);
        SAIL.Commitment memory c = sail.getCommitment(commitmentHash);

        console.log("=== Execute Gate ===");
        console.log("Contract:        ", sailAddress);
        console.log("Agent:           ", ens);
        console.log("Commitment hash: ", vm.toString(commitmentHash));
        console.log("Commitment nonce:", c.nonce);
        console.log("Current nonce:   ", sail.getNonce(ens));
        console.log("Already executed:", c.executed);

        vm.startBroadcast(operatorKey);
        sail.execute(ens, commitmentHash);
        vm.stopBroadcast();

        SAIL.Agent memory agent = sail.getAgent(ens);
        console.log("Execution cleared.");
        console.log("Commitment count:", agent.commitmentCount);
    }
}
