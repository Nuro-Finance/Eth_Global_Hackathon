// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AdminController.sol";
import "./VaultRegistry.sol";

/**
 * @title FeeRouter
 * @notice Receives the 0.5% competition pool allocation from the main Nuro fee split.
 *         Routes fees to the appropriate community or chain vault based on deposit metadata.
 *         10% of the 5% protocol fee = 0.5% of every deposit.
 */
contract FeeRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    AdminController public admin;
    VaultRegistry   public vaultRegistry;
    IERC20          public usdc;

    // USDC on Base
    address public constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Reserve vault entity id for unaffiliated deposits
    bytes32 public constant RESERVE_ID = keccak256("RESERVE");

    // Active round tracked per competition type
    mapping(uint8 => bytes32) public activeRound; // RoundType => roundId

    address public competitionEngine;

    event FeeRouted(bytes32 indexed roundId, bytes32 indexed entityId, uint256 amount, string routeType);
    event ReserveFallback(bytes32 indexed roundId, uint256 amount);

    modifier onlyOps() {
        require(
            admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender) ||
            admin.hasRole(admin.OPS_ADMIN_ROLE(), msg.sender),
            "FeeRouter: ops only"
        );
        _;
    }

    modifier onlyEngine() {
        require(msg.sender == competitionEngine, "FeeRouter: only CompetitionEngine");
        _;
    }

    constructor(address _admin, address _vaultRegistry) {
        admin = AdminController(_admin);
        vaultRegistry = VaultRegistry(_vaultRegistry);
        usdc = IERC20(USDC_BASE);
    }

    function setCompetitionEngine(address _engine) external onlyOps {
        competitionEngine = _engine;
    }

    function setActiveRound(uint8 roundType, bytes32 roundId) external onlyEngine {
        activeRound[roundType] = roundId;
    }

    /**
     * @notice Route incoming competition fee to the correct vault.
     * @param amount        USDC amount (6 decimals)
     * @param communityId   keccak256 of community name, or bytes32(0) if none
     * @param chainId       origin chain id (mapped to chain vault entity id)
     * @param roundType     0=DAILY 1=WEEKLY 2=MONTHLY 3=QUARTERLY 4=ANNUAL
     */
    function routeFee(
        uint256 amount,
        bytes32 communityId,
        bytes32 chainId,
        uint8   roundType
    ) external nonReentrant onlyOps {
        require(amount > 0, "FeeRouter: zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        bytes32 roundId = activeRound[roundType];

        // Split: 50% to community vault, 50% to chain vault
        // If no community, 100% to chain vault. If no chain, 100% to community.
        // If neither, 100% to reserve.
        if (communityId != bytes32(0) && chainId != bytes32(0)) {
            uint256 half = amount / 2;
            uint256 remainder = amount - half;
            _route(roundId, communityId, half, "COMMUNITY");
            _route(roundId, chainId, remainder, "CHAIN");
        } else if (communityId != bytes32(0)) {
            _route(roundId, communityId, amount, "COMMUNITY");
        } else if (chainId != bytes32(0)) {
            _route(roundId, chainId, amount, "CHAIN");
        } else {
            _route(roundId, RESERVE_ID, amount, "RESERVE");
            emit ReserveFallback(roundId, amount);
        }
    }

    function _route(bytes32 roundId, bytes32 entityId, uint256 amount, string memory routeType) internal {
        usdc.safeTransfer(address(vaultRegistry), amount);
        vaultRegistry.accumulateFee(roundId, entityId, amount);
        emit FeeRouted(roundId, entityId, amount, routeType);
    }
}
