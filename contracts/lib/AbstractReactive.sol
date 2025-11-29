// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AbstractPayer.sol";
import "../interfaces/IReactive.sol";
import "../interfaces/ISystemContract.sol";

abstract contract AbstractReactive is AbstractPayer, IReactive {
    uint256 internal constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    ISystemContract internal constant SERVICE_ADDR = ISystemContract(payable(0x0000000000000000000000000000000000fffFfF));
    
    ISystemContract internal service;
    bool internal vm;
    address internal rvm_id; 

    modifier vmOnly() {
        require(vm, 'VM only');
        _;
    }

    modifier rnOnly() {
        require(!vm, 'Reactive Network only');
        _;
    }

    
    modifier rvmIdOnly(address _rvmId) {
        require(rvm_id == address(0) || rvm_id == _rvmId, 'Authorized RVM ID only');
        _;
    }

    constructor() {
        vendor = service = SERVICE_ADDR;
        addAuthorizedSender(address(SERVICE_ADDR));
        detectVm();
        rvm_id = msg.sender; 
    }

    function detectVm() internal {
        uint256 size;
        assembly { 
            size := extcodesize(0x0000000000000000000000000000000000fffFfF) 
        }
        vm = size == 0;
    }
}
