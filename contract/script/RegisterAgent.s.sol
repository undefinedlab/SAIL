// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {SAIL} from "../src/SAIL.sol";

/// @title RegisterAgent
/// @notice Registers an AI agent on a deployed SAIL contract.
/// @dev Required env vars:
///      PRIVATE_KEY       — operator private key
///      SAIL_ADDRESS      — deployed SAIL contract address
///      AGENT_ENS         — ENS name (e.g. "myagent.sail.eth")
///      AUDITOR_ADDRESS   — address authorized to audit this agent
///      STAKE_AMOUNT      — stake in wei (defaults to 0.1 ETH if not set)
///      TIER              — 0=Optimistic, 1=ZK, 2=TEE (defaults to 0)
///
/// forge script script/RegisterAgent.s.sol \
///   --broadcast --rpc-url eth_sepolia
contract RegisterAgent is Script {
    function run() external {
        uint256 operatorKey = vm.envUint("PRIVATE_KEY");
        address sailAddress = vm.envAddress("SAIL_ADDRESS");
        string memory ens = vm.envString("AGENT_ENS");
        address auditorAddress = vm.envAddress("AUDITOR_ADDRESS");
        uint256 stake = vm.envOr("STAKE_AMOUNT", uint256(0.1 ether));
        uint256 tierIndex = vm.envOr("TIER", uint256(0));

        SAIL sail = SAIL(sailAddress);
        SAIL.Tier tier = SAIL.Tier(tierIndex);

        address[] memory auditors = new address[](1);
        auditors[0] = auditorAddress;

        console.log("=== Register Agent ===");
        console.log("Contract: ", sailAddress);
        console.log("ENS:      ", ens);
        console.log("Auditor:  ", auditorAddress);
        console.log("Stake:    ", stake);
        console.log("Tier:     ", tierIndex);

        vm.startBroadcast(operatorKey);
        sail.register{value: stake}(ens, tier, auditors);
        vm.stopBroadcast();

        SAIL.Agent memory agent = sail.getAgent(ens);
        console.log("Registered.");
        console.log("Wallet:   ", agent.wallet);
        console.log("Active:   ", agent.active);
        console.log("Nonce:    ", sail.getNonce(ens));
    }
}
