// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IYieldAdapter.sol";

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IAaveDataProvider {
    function getReserveData(address asset) external view returns (
        uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken,
        uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate,
        uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate,
        uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp
    );
}

/**
 * @title AaveV3Adapter
 * @notice Yield adapter for Aave V3 USDC supply on Base.
 */
contract AaveV3Adapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    address public constant USDC_BASE  = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant AAVE_POOL  = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address public constant AAVE_DATA  = 0xD82A47fDEBb5Bf5329b09441C3Dab4B1c1B50A8e;
    address public constant AUSDC_BASE = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    IERC20 public usdc  = IERC20(USDC_BASE);
    IERC20 public aUsdc = IERC20(AUSDC_BASE);

    address public yieldRouter;

    modifier onlyRouter() {
        require(msg.sender == yieldRouter, "AaveV3Adapter: only YieldRouter");
        _;
    }

    constructor(address _yieldRouter) {
        yieldRouter = _yieldRouter;
    }

    function deposit(uint256 amount) external override onlyRouter {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.forceApprove(AAVE_POOL, amount);
        IAavePool(AAVE_POOL).supply(USDC_BASE, amount, address(this), 0);
    }

    function withdraw(uint256 amount) external override onlyRouter returns (uint256 received) {
        received = IAavePool(AAVE_POOL).withdraw(USDC_BASE, amount, msg.sender);
    }

    function balanceOf(address account) external view override returns (uint256) {
        return aUsdc.balanceOf(account);
    }

    function currentAPY() external view override returns (uint256) {
        (,,,,, uint256 liquidityRate,,,,,, ) = IAaveDataProvider(AAVE_DATA).getReserveData(USDC_BASE);
        return liquidityRate / 1e23;
    }

    function emergencyExit() external override onlyRouter {
        uint256 balance = aUsdc.balanceOf(address(this));
        if (balance > 0) {
            IAavePool(AAVE_POOL).withdraw(USDC_BASE, balance, msg.sender);
        }
    }

    function strategyName() external pure override returns (string memory) {
        return "Aave V3 USDC Supply - Base";
    }
}