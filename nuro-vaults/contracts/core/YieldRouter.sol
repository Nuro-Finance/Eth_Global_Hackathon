// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AdminController.sol";
import "../interfaces/IYieldAdapter.sol";

/**
 * @title YieldRouter
 * @notice Deploys pooled USDC into yield strategies during competition rounds.
 *         Protocol-agnostic: strategy selection is managed via registered IYieldAdapter contracts.
 *         Supports Curve 3pool, Convex, Aave V3, and Curve Wars bribe market adapters.
 */
contract YieldRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    AdminController public admin;
    IERC20          public usdc;

    address public constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // strategyId => adapter address
    mapping(bytes32 => address) public strategies;
    bytes32[] public strategyIds;

    // roundId => deployed strategy
    mapping(bytes32 => address) public roundStrategy;
    // roundId => amount deployed
    mapping(bytes32 => uint256) public roundDeployed;

    // Emergency: all yield operations paused
    bool public emergencyPaused;

    address public competitionEngine;

    event StrategyRegistered(bytes32 indexed strategyId, address adapter);
    event StrategyDeregistered(bytes32 indexed strategyId);
    event YieldDeployed(bytes32 indexed roundId, address strategy, uint256 amount);
    event YieldHarvested(bytes32 indexed roundId, address strategy, uint256 principal, uint256 yield);
    event EmergencyWithdraw(bytes32 indexed roundId, address strategy, uint256 amount);

    modifier onlyOps() {
        require(
            admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender) ||
            admin.hasRole(admin.OPS_ADMIN_ROLE(), msg.sender),
            "YieldRouter: ops only"
        );
        _;
    }

    modifier onlyDeployer() {
        require(admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender), "YieldRouter: deployer only");
        _;
    }

    modifier notEmergencyPaused() {
        require(!emergencyPaused, "YieldRouter: emergency paused");
        _;
    }

    constructor(address _admin) {
        admin = AdminController(_admin);
        usdc = IERC20(USDC_BASE);
    }

    function setCompetitionEngine(address _engine) external onlyOps {
        competitionEngine = _engine;
    }

    function registerStrategy(bytes32 strategyId, address adapter) external onlyDeployer {
        require(adapter != address(0), "YieldRouter: zero address");
        strategies[strategyId] = adapter;
        strategyIds.push(strategyId);
        emit StrategyRegistered(strategyId, adapter);
    }

    function deregisterStrategy(bytes32 strategyId) external onlyDeployer {
        delete strategies[strategyId];
        emit StrategyDeregistered(strategyId);
    }

    /**
     * @notice Deploy USDC from vault into yield strategy for a round.
     */
    function deployYield(bytes32 roundId, bytes32 strategyId, uint256 amount) external onlyOps nonReentrant notEmergencyPaused {
        address adapter = strategies[strategyId];
        require(adapter != address(0), "YieldRouter: strategy not found");
        require(roundDeployed[roundId] == 0, "YieldRouter: already deployed for round");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.forceApprove(adapter, amount);
        IYieldAdapter(adapter).deposit(amount);

        roundStrategy[roundId] = adapter;
        roundDeployed[roundId] = amount;

        emit YieldDeployed(roundId, adapter, amount);
    }

    /**
     * @notice Harvest yield at round settlement. Returns principal + yield to caller.
     */
    function harvestYield(bytes32 roundId) external onlyOps nonReentrant returns (uint256 principal, uint256 yield) {
        address adapter = roundStrategy[roundId];
        require(adapter != address(0), "YieldRouter: no strategy for round");

        principal = roundDeployed[roundId];
        uint256 balanceBefore = usdc.balanceOf(address(this));

        IYieldAdapter(adapter).withdraw(principal);

        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;
        yield = received > principal ? received - principal : 0;

        usdc.safeTransfer(msg.sender, received);

        emit YieldHarvested(roundId, adapter, principal, yield);
    }

    /**
     * @notice Emergency: pull all funds from a strategy immediately.
     *         Requires multisig approval (checked off-chain via AdminController).
     */
    function emergencyWithdraw(bytes32 roundId) external onlyDeployer nonReentrant {
        address adapter = roundStrategy[roundId];
        require(adapter != address(0), "YieldRouter: no strategy for round");

        uint256 amount = IYieldAdapter(adapter).balanceOf(address(this));
        IYieldAdapter(adapter).emergencyExit();

        uint256 recovered = usdc.balanceOf(address(this));
        usdc.safeTransfer(admin.multisig(), recovered);

        emergencyPaused = true;
        emit EmergencyWithdraw(roundId, adapter, recovered);
    }

    function setEmergencyPaused(bool _paused) external onlyDeployer {
        emergencyPaused = _paused;
    }
}
