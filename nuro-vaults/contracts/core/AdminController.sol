// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AdminController
 * @notice Role-based access control for all Nuro Vault Competition admin functions.
 *         DEPLOYER_ROLE: full access
 *         OPS_ADMIN_ROLE: operational controls (start/pause rounds, lottery)
 *         READ_ONLY_ROLE: read access only (no state changes)
 */
contract AdminController is AccessControl, Pausable {
    bytes32 public constant DEPLOYER_ROLE   = keccak256("DEPLOYER_ROLE");
    bytes32 public constant OPS_ADMIN_ROLE  = keccak256("OPS_ADMIN_ROLE");
    bytes32 public constant READ_ONLY_ROLE  = keccak256("READ_ONLY_ROLE");

    // Multisig address required for critical operations
    address public multisig;

    // Pending multisig confirmations for critical ops
    mapping(bytes32 => uint256) public pendingConfirmations;
    mapping(bytes32 => mapping(address => bool)) public hasConfirmed;

    uint256 public constant REQUIRED_CONFIRMATIONS = 2;

    event MultisigUpdated(address indexed oldMultisig, address indexed newMultisig);
    event CriticalOpProposed(bytes32 indexed opHash, address indexed proposer);
    event CriticalOpConfirmed(bytes32 indexed opHash, address indexed confirmer, uint256 confirmations);
    event CriticalOpExecuted(bytes32 indexed opHash);

    constructor(address _multisig, address _deployer) {
        multisig = _multisig;
        _grantRole(DEFAULT_ADMIN_ROLE, _deployer);
        _grantRole(DEPLOYER_ROLE, _deployer);
        _grantRole(DEPLOYER_ROLE, _multisig);
    }

    modifier onlyDeployer() {
        require(hasRole(DEPLOYER_ROLE, msg.sender), "AdminController: deployer only");
        _;
    }

    modifier onlyOpsOrAbove() {
        require(
            hasRole(DEPLOYER_ROLE, msg.sender) || hasRole(OPS_ADMIN_ROLE, msg.sender),
            "AdminController: ops admin or above required"
        );
        _;
    }

    /**
     * @notice Propose a critical operation (emergency withdraw, bracket manipulation).
     *         Requires REQUIRED_CONFIRMATIONS from deployer-role wallets before execution.
     */
    function proposeCriticalOp(bytes32 opHash) external onlyDeployer {
        pendingConfirmations[opHash] = 1;
        hasConfirmed[opHash][msg.sender] = true;
        emit CriticalOpProposed(opHash, msg.sender);
    }

    function confirmCriticalOp(bytes32 opHash) external onlyDeployer {
        require(pendingConfirmations[opHash] > 0, "AdminController: op not proposed");
        require(!hasConfirmed[opHash][msg.sender], "AdminController: already confirmed");
        hasConfirmed[opHash][msg.sender] = true;
        pendingConfirmations[opHash]++;
        emit CriticalOpConfirmed(opHash, msg.sender, pendingConfirmations[opHash]);
    }

    function isCriticalOpApproved(bytes32 opHash) public view returns (bool) {
        return pendingConfirmations[opHash] >= REQUIRED_CONFIRMATIONS;
    }

    function clearCriticalOp(bytes32 opHash) external onlyDeployer {
        delete pendingConfirmations[opHash];
        emit CriticalOpExecuted(opHash);
    }

    function updateMultisig(address _newMultisig) external onlyDeployer {
        emit MultisigUpdated(multisig, _newMultisig);
        multisig = _newMultisig;
    }

    function pause() external onlyDeployer { _pause(); }
    function unpause() external onlyDeployer { _unpause(); }
}
