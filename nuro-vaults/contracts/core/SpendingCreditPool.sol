// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AdminController.sol";

/**
 * @title SpendingCreditPool
 * @notice Holds and tracks user spending credits awarded from competition round wins and lottery.
 *         Credits are applied against card transactions by the Nuro middleware before routing to Owen/SD3.
 *         Credits expire after a configurable window and are recycled to the reserve pool.
 */
contract SpendingCreditPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    AdminController public admin;
    IERC20          public usdc;

    address public constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    struct Credit {
        uint256 amount;
        uint256 expiry;
        bytes32 sourceRound;
        string  sourceName;
    }

    // user => list of credits
    mapping(address => Credit[]) public userCredits;
    // user => total available balance
    mapping(address => uint256) public userCreditBalance;

    // Default expiry: 90 days
    uint256 public defaultExpiryDuration = 90 days;

    address public reserveVault;
    address public lotteryEngine;
    address public competitionEngine;

    event CreditAwarded(address indexed user, uint256 amount, bytes32 sourceRound, string sourceName);
    event CreditApplied(address indexed user, uint256 amount, uint256 remainingBalance);
    event CreditExpired(address indexed user, uint256 amount, bytes32 sourceRound);
    event ExpiryDurationUpdated(uint256 newDuration);

    modifier onlyAuthorized() {
        require(
            msg.sender == lotteryEngine ||
            msg.sender == competitionEngine ||
            admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender) ||
            admin.hasRole(admin.OPS_ADMIN_ROLE(), msg.sender),
            "SpendingCreditPool: unauthorized"
        );
        _;
    }

    modifier onlyOps() {
        require(
            admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender) ||
            admin.hasRole(admin.OPS_ADMIN_ROLE(), msg.sender),
            "SpendingCreditPool: ops only"
        );
        _;
    }

    constructor(address _admin) {
        admin = AdminController(_admin);
        usdc = IERC20(USDC_BASE);
    }

    function setLotteryEngine(address _lottery) external onlyOps { lotteryEngine = _lottery; }
    function setCompetitionEngine(address _engine) external onlyOps { competitionEngine = _engine; }
    function setReserveVault(address _reserve) external onlyOps { reserveVault = _reserve; }

    /**
     * @notice Award spending credits to a user.
     */
    function awardCredit(
        address user,
        uint256 amount,
        bytes32 sourceRound,
        string calldata sourceName
    ) external onlyAuthorized nonReentrant {
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        userCredits[user].push(Credit({
            amount: amount,
            expiry: block.timestamp + defaultExpiryDuration,
            sourceRound: sourceRound,
            sourceName: sourceName
        }));
        userCreditBalance[user] += amount;

        emit CreditAwarded(user, amount, sourceRound, sourceName);
    }

    /**
     * @notice Apply credits against a card transaction.
     *         Called by Nuro middleware before routing payment to Owen/SD3.
     *         Returns actual amount covered by credits.
     */
    function applyCredit(address user, uint256 transactionAmount) external onlyOps nonReentrant returns (uint256 covered) {
        _expireStaleCredits(user);

        uint256 available = userCreditBalance[user];
        covered = transactionAmount > available ? available : transactionAmount;

        if (covered > 0) {
            userCreditBalance[user] -= covered;
            _deductFromCredits(user, covered);
            usdc.safeTransfer(msg.sender, covered);
        }

        emit CreditApplied(user, covered, userCreditBalance[user]);
    }

    function _deductFromCredits(address user, uint256 amount) internal {
        uint256 remaining = amount;
        for (uint256 i = 0; i < userCredits[user].length && remaining > 0; i++) {
            Credit storage c = userCredits[user][i];
            if (c.amount == 0 || c.expiry < block.timestamp) continue;
            if (c.amount <= remaining) {
                remaining -= c.amount;
                c.amount = 0;
            } else {
                c.amount -= remaining;
                remaining = 0;
            }
        }
    }

    function _expireStaleCredits(address user) internal {
        for (uint256 i = 0; i < userCredits[user].length; i++) {
            Credit storage c = userCredits[user][i];
            if (c.amount > 0 && c.expiry < block.timestamp) {
                uint256 expired = c.amount;
                userCreditBalance[user] -= expired;
                c.amount = 0;
                emit CreditExpired(user, expired, c.sourceRound);
                // Recycle to reserve
                if (reserveVault != address(0)) {
                    usdc.safeTransfer(reserveVault, expired);
                }
            }
        }
    }

    function getUserCredits(address user) external view returns (Credit[] memory) {
        return userCredits[user];
    }

    function setDefaultExpiryDuration(uint256 duration) external onlyOps {
        defaultExpiryDuration = duration;
        emit ExpiryDurationUpdated(duration);
    }

    /**
     * @notice Admin: manually clear all credits for a user (e.g. account closure).
     */
    function clearUserCredits(address user) external onlyOps {
        userCreditBalance[user] = 0;
        delete userCredits[user];
    }
}
