// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {SAIL} from "../src/SAIL.sol";

/// @title Commit
/// @notice Posts a commitment on-chain for a registered SAIL agent.
/// @dev Called by the SAIL MCP server after:
///      1. Encrypting the commitment blob via Lit Protocol.
///      2. Writing the encrypted blob to 0G Storage and receiving a CID.
///
///      Required env vars:
///      PRIVATE_KEY         — operator private key
///      SAIL_ADDRESS        — deployed SAIL contract address
///      AGENT_ENS           — ENS name of the agent
///      COMMITMENT_HASH     — hex hash of the full commitment blob
///      INPUT_HASH          — hex hash of all inputs before reasoning
///      ZERO_G_CID          — 0G Storage CID of the encrypted blob
///
/// forge script script/Commit.s.sol \
///   --broadcast --rpc-url eth_sepolia
contract Commit is Script {
    function run() external {
        uint256 operatorKey = vm.envUint("PRIVATE_KEY");
        address sailAddress = vm.envAddress("SAIL_ADDRESS");
        string memory ens = vm.envString("AGENT_ENS");
        bytes32 commitmentHash = vm.envBytes32("COMMITMENT_HASH");
        bytes32 inputHash = vm.envBytes32("INPUT_HASH");
        string memory cid = vm.envString("ZERO_G_CID");

        SAIL sail = SAIL(sailAddress);

        uint256 nonceBefore = sail.getNonce(ens);

        console.log("=== Post Commitment ===");
        console.log("Contract:        ", sailAddress);
        console.log("Agent:           ", ens);
        console.log("Nonce (before):  ", nonceBefore);
        console.log("Commitment hash: ", vm.toString(commitmentHash));
        console.log("Input hash:      ", vm.toString(inputHash));
        console.log("0G CID:          ", cid);

        vm.startBroadcast(operatorKey);
        sail.commit(ens, commitmentHash, inputHash, cid);
        vm.stopBroadcast();

        console.log("Commitment posted.");
        console.log("Nonce (after):   ", sail.getNonce(ens));
        console.log("Timestamp:       ", sail.getCommitment(commitmentHash).timestamp);
    }
}
