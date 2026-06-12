// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AdminController.sol";

/**
 * @title VaultRegistry
 * @notice Master registry for all community and chain vaults.
 *         Tracks per-entity fee accumulation across active competition rounds.
 */
contract VaultRegistry is ReentrancyGuard {
    AdminController public admin;

    enum VaultType { COMMUNITY, CHAIN, RESERVE }

    struct Vault {
        bytes32 entityId;
        string  name;
        VaultType vaultType;
        uint256 balance;
        uint256 totalAccumulated;
        bool    isActive;
    }

    mapping(bytes32 => Vault) public vaults;
    bytes32[] public vaultIds;

    // roundId => entityId => accumulated fees
    mapping(bytes32 => mapping(bytes32 => uint256)) public roundAccumulation;

    event VaultRegistered(bytes32 indexed entityId, string name, VaultType vaultType);
    event VaultDeactivated(bytes32 indexed entityId);
    event FeeAccumulated(bytes32 indexed roundId, bytes32 indexed entityId, uint256 amount);
    event BalanceWithdrawn(bytes32 indexed entityId, address indexed to, uint256 amount);

    address public feeRouter;

    modifier onlyFeeRouter() {
        require(msg.sender == feeRouter, "VaultRegistry: only FeeRouter");
        _;
    }

    modifier onlyOps() {
        require(
            admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender) ||
            admin.hasRole(admin.OPS_ADMIN_ROLE(), msg.sender),
            "VaultRegistry: ops only"
        );
        _;
    }

    constructor(address _admin) {
        admin = AdminController(_admin);
    }

    function setFeeRouter(address _feeRouter) external onlyOps {
        feeRouter = _feeRouter;
    }

    function registerVault(bytes32 entityId, string calldata name, VaultType vaultType) external onlyOps {
        require(vaults[entityId].entityId == bytes32(0), "VaultRegistry: already registered");
        vaults[entityId] = Vault({ entityId: entityId, name: name, vaultType: vaultType, balance: 0, totalAccumulated: 0, isActive: true });
        vaultIds.push(entityId);
        emit VaultRegistered(entityId, name, vaultType);
    }

    function deactivateVault(bytes32 entityId) external onlyOps {
        vaults[entityId].isActive = false;
        emit VaultDeactivated(entityId);
    }

    /**
     * @notice Called by FeeRouter to credit fees to a vault for a specific round.
     */
    function accumulateFee(bytes32 roundId, bytes32 entityId, uint256 amount) external onlyFeeRouter {
        require(vaults[entityId].isActive, "VaultRegistry: vault inactive");
        vaults[entityId].balance += amount;
        vaults[entityId].totalAccumulated += amount;
        roundAccumulation[roundId][entityId] += amount;
        emit FeeAccumulated(roundId, entityId, amount);
    }

    function getRoundAccumulation(bytes32 roundId, bytes32 entityId) external view returns (uint256) {
        return roundAccumulation[roundId][entityId];
    }

    function getAllVaultIds() external view returns (bytes32[] memory) {
        return vaultIds;
    }

    function getVault(bytes32 entityId) external view returns (Vault memory) {
        return vaults[entityId];
    }
}
