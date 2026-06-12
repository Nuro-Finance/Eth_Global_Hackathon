// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";
import "./AdminController.sol";
import "./SpendingCreditPool.sol";

/**
 * @title LotteryEngine
 * @notice Chainlink VRF-powered lottery for Nuro vault competition.
 *         Selects random winners from eligible users per round.
 *         Winners receive USDC spending credits via SpendingCreditPool.
 */
contract LotteryEngine is VRFConsumerBaseV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Chainlink VRF on Base Sepolia
    VRFCoordinatorV2Interface public coordinator;
    uint64  public subscriptionId;
    bytes32 public keyHash;
    uint32  public callbackGasLimit = 300_000;
    uint16  public requestConfirmations = 3;

    AdminController    public admin;
    SpendingCreditPool public creditPool;
    IERC20             public usdc;

    address public constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    struct LotteryRound {
        bytes32   roundId;
        address[] eligibleUsers;
        uint256   potAmount;
        uint256   winnerCount;
        address[] winners;
        bool      settled;
        uint256   vrfRequestId;
    }

    mapping(bytes32 => LotteryRound) public lotteryRounds;
    mapping(uint256 => bytes32)      public vrfRequestToRound;

    // Per round-type winner counts
    mapping(uint8 => uint256) public winnerCountByRoundType;
    // Per round-type scheduled lottery enabled
    mapping(uint8 => bool) public scheduledLotteryEnabled;

    // Reserve pot percentage (out of 100)
    uint256 public reservePotPct = 5;

    event LotteryInitiated(bytes32 indexed roundId, uint256 potAmount, uint256 winnerCount, uint256 vrfRequestId);
    event LotterySettled(bytes32 indexed roundId, address[] winners, uint256 perWinnerAmount);
    event EligibleUserAdded(bytes32 indexed roundId, address user);

    modifier onlyOps() {
        require(
            admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender) ||
            admin.hasRole(admin.OPS_ADMIN_ROLE(), msg.sender),
            "LotteryEngine: ops only"
        );
        _;
    }

    constructor(
        address _admin,
        address _creditPool,
        address _vrfCoordinator,
        uint64  _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        admin          = AdminController(_admin);
        creditPool     = SpendingCreditPool(_creditPool);
        usdc           = IERC20(USDC_BASE);
        coordinator    = VRFCoordinatorV2Interface(_vrfCoordinator);
        subscriptionId = _subscriptionId;
        keyHash        = _keyHash;

        // Default winner counts
        winnerCountByRoundType[0] = 3;   // DAILY
        winnerCountByRoundType[1] = 10;  // WEEKLY
        winnerCountByRoundType[2] = 25;  // MONTHLY
        winnerCountByRoundType[3] = 50;  // QUARTERLY
        winnerCountByRoundType[4] = 100; // ANNUAL

        // Enable scheduled lottery for all types by default
        for (uint8 i = 0; i < 5; i++) {
            scheduledLotteryEnabled[i] = true;
        }
    }

    /**
     * @notice Register eligible users for a lottery round.
     *         Any user who deposited during the round is eligible.
     */
    function addEligibleUser(bytes32 roundId, address user) external onlyOps {
        lotteryRounds[roundId].eligibleUsers.push(user);
        emit EligibleUserAdded(roundId, user);
    }

    function addEligibleUsersBatch(bytes32 roundId, address[] calldata users) external onlyOps {
        for (uint256 i = 0; i < users.length; i++) {
            lotteryRounds[roundId].eligibleUsers.push(users[i]);
        }
    }

    /**
     * @notice Initiate lottery for a round. Requests randomness from Chainlink VRF.
     */
    function initiateLottery(bytes32 roundId, uint256 potAmount, uint8 roundType) external onlyOps nonReentrant {
        LotteryRound storage lr = lotteryRounds[roundId];
        require(!lr.settled, "LotteryEngine: already settled");
        require(lr.eligibleUsers.length > 0, "LotteryEngine: no eligible users");

        usdc.safeTransferFrom(msg.sender, address(this), potAmount);

        uint256 winnerCount = winnerCountByRoundType[roundType];
        if (winnerCount > lr.eligibleUsers.length) {
            winnerCount = lr.eligibleUsers.length;
        }

        lr.roundId    = roundId;
        lr.potAmount  = potAmount;
        lr.winnerCount = winnerCount;

        uint256 requestId = coordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            uint32(winnerCount)
        );

        lr.vrfRequestId = requestId;
        vrfRequestToRound[requestId] = roundId;

        emit LotteryInitiated(roundId, potAmount, winnerCount, requestId);
    }

    /**
     * @notice Chainlink VRF callback. Selects winners and awards credits.
     */
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        bytes32 roundId = vrfRequestToRound[requestId];
        LotteryRound storage lr = lotteryRounds[roundId];
        require(!lr.settled, "LotteryEngine: already settled");

        uint256 eligible = lr.eligibleUsers.length;
        uint256 perWinner = lr.potAmount / lr.winnerCount;

        address[] memory winners = new address[](lr.winnerCount);
        bool[] memory selected = new bool[](eligible);

        for (uint256 i = 0; i < lr.winnerCount; i++) {
            uint256 idx = randomWords[i] % eligible;
            // Simple collision avoidance: increment until unselected
            while (selected[idx]) { idx = (idx + 1) % eligible; }
            selected[idx] = true;
            winners[i] = lr.eligibleUsers[idx];

            usdc.forceApprove(address(creditPool), perWinner);
            creditPool.awardCredit(winners[i], perWinner, roundId, "LOTTERY_WIN");
        }

        lr.winners = winners;
        lr.settled = true;

        emit LotterySettled(roundId, winners, perWinner);
    }

    function setWinnerCount(uint8 roundType, uint256 count) external onlyOps {
        winnerCountByRoundType[roundType] = count;
    }

    function toggleScheduledLottery(uint8 roundType, bool enabled) external onlyOps {
        scheduledLotteryEnabled[roundType] = enabled;
    }

    function setReservePotPct(uint256 pct) external onlyOps {
        require(pct <= 100, "LotteryEngine: pct > 100");
        reservePotPct = pct;
    }

    function getLotteryRound(bytes32 roundId) external view returns (LotteryRound memory) {
        return lotteryRounds[roundId];
    }
}
