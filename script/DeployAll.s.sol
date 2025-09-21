// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Counter} from "../contracts/Counter.sol";

contract DeployAllScript is Script {
    // Contract instances
    Counter public counter;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        console.log("Deploying all contracts...");

        // Deploy Counter contract
        counter = new Counter();
        console.log("Counter deployed at:", address(counter));

        console.log("All contracts deployed successfully!");

        vm.stopBroadcast();
    }
}
