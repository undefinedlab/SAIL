// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {SAIL} from "../src/SAIL.sol";

/// @title Deploy
/// @notice Deploys the SAIL contract to the target network.
/// @dev Reads PRIVATE_KEY from environment. Logs deployed address and owner.
///
/// Ethereum Sepolia:
///   forge script script/Deploy.s.sol \
///     --broadcast --rpc-url eth_sepolia --verify
///
/// Base Sepolia:
///   forge script script/Deploy.s.sol \
///     --broadcast --rpc-url base_sepolia --verify
///
/// Local:
///   forge script script/Deploy.s.sol \
///     --broadcast --rpc-url localhost
contract Deploy is Script {
    function run() external returns (SAIL sail) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== SAIL Deployment ===");
        console.log("Network:  ", _networkName());
        console.log("Chain ID: ", block.chainid);
        console.log("Deployer: ", deployer);
        console.log("Balance:  ", deployer.balance);

        vm.startBroadcast(deployerKey);
        sail = new SAIL();
        vm.stopBroadcast();

        console.log("Deployed: ", address(sail));
        console.log("Owner:    ", sail.owner());
        console.log("Min stake:", sail.MINIMUM_STAKE());
    }

    function _networkName() internal view returns (string memory) {
        if (block.chainid == 11155111) return "Ethereum Sepolia";
        if (block.chainid == 84532) return "Base Sepolia";
        if (block.chainid == 8453) return "Base";
        if (block.chainid == 31337) return "Localhost";
        return "Unknown";
    }
}
