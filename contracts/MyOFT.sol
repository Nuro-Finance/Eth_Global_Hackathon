// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";

/**
 * @title NuroOFT
 * @dev Synthetic USDC representation on source chains for Nuro bridge.
 * Uses 6 decimals to match native USDC on Base.
 */
contract MyOFT is OFT {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) Ownable(_delegate) {}

    /**
     * @dev Override to match USDC's 6 decimal places.
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}