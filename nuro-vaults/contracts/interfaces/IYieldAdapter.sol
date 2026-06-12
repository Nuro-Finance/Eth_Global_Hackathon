// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IYieldAdapter
 * @notice Protocol-agnostic interface for yield strategy adapters.
 *         Implementations: CurveAdapter, ConvexAdapter, AaveV3Adapter, CurveWarsAdapter
 */
interface IYieldAdapter {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256 received);
    function balanceOf(address account) external view returns (uint256);
    function currentAPY() external view returns (uint256); // basis points, e.g. 500 = 5%
    function emergencyExit() external;
    function strategyName() external view returns (string memory);
}
