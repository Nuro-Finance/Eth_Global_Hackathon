// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./AdminController.sol";
import "./VaultRegistry.sol";
import "./FeeRouter.sol";

/**
 * @title CompetitionEngine
 * @notice Manages the full round lifecycle: open, accumulate, settle, distribute.
 *         Supports DAILY, WEEKLY, MONTHLY, QUARTERLY, and ANNUAL rounds simultaneously.
 *         Bracket tiers: MICRO, EMERGING, GROWTH, MAJOR, INSTITUTIONAL.
 */
contract CompetitionEngine is ReentrancyGuard, Pausable {

    AdminController public admin;
    VaultRegistry   public vaultRegistry;
    FeeRouter       public feeRouter;

    enum RoundType   { DAILY, WEEKLY, MONTHLY, QUARTERLY, ANNUAL }
    enum RoundStatus { OPEN, ACCUMULATING, SETTLING, CLOSED, PAUSED }
    enum BracketTier { MICRO, EMERGING, GROWTH, MAJOR, INSTITUTIONAL }

    struct Round {
        bytes32    roundId;
        RoundType  roundType;
        RoundStatus status;
        BracketTier tier;
        uint256    startTimestamp;
        uint256    endTimestamp;
        uint256    totalPool;
        uint256    totalYield;
        bytes32    winner;      // entityId of winner
        address    yieldStrategy;
    }

    // roundId => Round
    mapping(bytes32 => Round) public rounds;
    // roundType => current active roundId
    mapping(uint8 => bytes32) public activeRoundByType;
    // All round ids in order
    bytes32[] public allRoundIds;

    // Bracket tier thresholds (30-day spend in USDC, 6 decimals)
    mapping(uint8 => uint256) public bracketThresholds;

    // Community bracket assignments: entityId => tier
    mapping(bytes32 => BracketTier) public communityBracket;

    event RoundOpened(bytes32 indexed roundId, RoundType roundType, BracketTier tier, uint256 endTimestamp);
    event RoundActivated(bytes32 indexed roundId);
    event RoundPaused(bytes32 indexed roundId);
    event RoundResumed(bytes32 indexed roundId);
    event RoundSettled(bytes32 indexed roundId, bytes32 indexed winner, uint256 totalYield);
    event BracketThresholdUpdated(uint8 tier, uint256 threshold);
    event CommunityBracketAssigned(bytes32 indexed entityId, BracketTier tier);

    modifier onlyOps() {
        require(
            admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender) ||
            admin.hasRole(admin.OPS_ADMIN_ROLE(), msg.sender),
            "CompetitionEngine: ops only"
        );
        _;
    }

    modifier onlyDeployer() {
        require(admin.hasRole(admin.DEPLOYER_ROLE(), msg.sender), "CompetitionEngine: deployer only");
        _;
    }

    constructor(address _admin, address _vaultRegistry, address _feeRouter) {
        admin = AdminController(_admin);
        vaultRegistry = VaultRegistry(_vaultRegistry);
        feeRouter = FeeRouter(_feeRouter);

        // Default bracket thresholds in USDC (6 decimals)
        bracketThresholds[0] = 100_000 * 1e6;       // MICRO
        bracketThresholds[1] = 1_000_000 * 1e6;     // EMERGING
        bracketThresholds[2] = 10_000_000 * 1e6;    // GROWTH
        bracketThresholds[3] = 100_000_000 * 1e6;   // MAJOR
        bracketThresholds[4] = type(uint256).max;    // INSTITUTIONAL
    }

    /**
     * @notice Open a new competition round.
     * @param roundType   0=DAILY ... 4=ANNUAL
     * @param tier        bracket tier
     * @param duration    round duration in seconds
     * @param strategy    yield strategy contract address
     */
    function openRound(
        RoundType roundType,
        BracketTier tier,
        uint256 duration,
        address strategy
    ) external onlyOps whenNotPaused returns (bytes32 roundId) {
        roundId = keccak256(abi.encodePacked(roundType, tier, block.timestamp, block.number));
        require(rounds[roundId].startTimestamp == 0, "CompetitionEngine: round exists");

        rounds[roundId] = Round({
            roundId: roundId,
            roundType: roundType,
            status: RoundStatus.OPEN,
            tier: tier,
            startTimestamp: block.timestamp,
            endTimestamp: block.timestamp + duration,
            totalPool: 0,
            totalYield: 0,
            winner: bytes32(0),
            yieldStrategy: strategy
        });

        activeRoundByType[uint8(roundType)] = roundId;
        allRoundIds.push(roundId);

        feeRouter.setActiveRound(uint8(roundType), roundId);

        emit RoundOpened(roundId, roundType, tier, block.timestamp + duration);
    }

    function activateRound(bytes32 roundId) external onlyOps {
        require(rounds[roundId].status == RoundStatus.OPEN, "CompetitionEngine: not OPEN");
        rounds[roundId].status = RoundStatus.ACCUMULATING;
        emit RoundActivated(roundId);
    }

    function pauseRound(bytes32 roundId) external onlyOps {
        require(rounds[roundId].status == RoundStatus.ACCUMULATING, "CompetitionEngine: not ACCUMULATING");
        rounds[roundId].status = RoundStatus.PAUSED;
        emit RoundPaused(roundId);
    }

    function resumeRound(bytes32 roundId) external onlyOps {
        require(rounds[roundId].status == RoundStatus.PAUSED, "CompetitionEngine: not PAUSED");
        rounds[roundId].status = RoundStatus.ACCUMULATING;
        emit RoundResumed(roundId);
    }

    /**
     * @notice Settle a round. Determines winner by highest vault accumulation in this round.
     *         Only considers vaults in the matching bracket tier.
     * @param roundId         round to settle
     * @param participantIds  array of entityIds competing in this round
     * @param yieldAmount     yield harvested from strategy (passed in by YieldRouter after harvest)
     */
    function settleRound(
        bytes32 roundId,
        bytes32[] calldata participantIds,
        uint256 yieldAmount
    ) external onlyOps nonReentrant {
        Round storage r = rounds[roundId];
        require(
            r.status == RoundStatus.ACCUMULATING || r.status == RoundStatus.PAUSED,
            "CompetitionEngine: invalid status for settlement"
        );

        r.status = RoundStatus.SETTLING;

        // Determine winner: highest fee accumulation in this round
        bytes32 winner;
        uint256 highestAmount;
        for (uint256 i = 0; i < participantIds.length; i++) {
            uint256 acc = vaultRegistry.getRoundAccumulation(roundId, participantIds[i]);
            if (acc > highestAmount) {
                highestAmount = acc;
                winner = participantIds[i];
            }
        }

        r.winner = winner;
        r.totalPool = highestAmount;
        r.totalYield = yieldAmount;
        r.status = RoundStatus.CLOSED;

        emit RoundSettled(roundId, winner, yieldAmount);
    }

    function setBracketThreshold(uint8 tier, uint256 threshold) external onlyDeployer {
        bracketThresholds[tier] = threshold;
        emit BracketThresholdUpdated(tier, threshold);
    }

    function assignCommunityBracket(bytes32 entityId, BracketTier tier) external onlyOps {
        communityBracket[entityId] = tier;
        emit CommunityBracketAssigned(entityId, tier);
    }

    function getRound(bytes32 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getAllRoundIds() external view returns (bytes32[] memory) {
        return allRoundIds;
    }

    function pause() external onlyDeployer { _pause(); }
    function unpause() external onlyDeployer { _unpause(); }
}
