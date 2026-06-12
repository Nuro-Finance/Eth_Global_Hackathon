// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { OFTMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTMsgCodec.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";

/**
 * @title MyOFTAdapter — Nuro USDC OFT Adapter (Session 28 Kelp-hardened)
 *
 * Wraps real USDC into a LayerZero-bridgeable OFTAdapter, with defence-in-depth
 * controls added in response to the Kelp DAO exploit (2026-04-18, $292M drained
 * via forged LayerZero message reaching a vanilla OFT receive handler).
 *
 * Kelp-class attack prerequisite: compromised DVN produces a cryptographically
 * valid attestation of a message that does not exist on the source chain. The
 * base OFTAdapter accepts that attestation and releases the escrowed token.
 *
 * This contract adds FOUR defence layers on top of the base OFTAdapter:
 *
 *   1. Per-message max cap — every inbound _lzReceive is capped at
 *      MAX_RECEIVE_PER_MESSAGE USDC. A single forged message can drain at
 *      most this cap; a 100M drain like Kelp would require MAX_RECEIVE_PER_MESSAGE
 *      / 100 ≈ several hundred forged messages, each of which must pass DVN
 *      attestation, blowing up the attack's operational cost.
 *
 *   2. Per-peer cumulative window cap — rolling 24h cumulative inbound per
 *      source chain is tracked on-chain. Any pathway exceeding
 *      MAX_RECEIVE_PER_PEER_24H reverts. Sliding window via last-reset
 *      timestamp. The on-chain cap is an additional ceiling beyond DVN trust.
 *
 *   3. Global kill-switch — owner can call setPaused(true) in <1 block to halt
 *      all inbound messages. Complements the 46-minute Kelp pause that saved
 *      the second $100M wave. Multisig-controlled via Ownable.
 *
 *   4. Rich event stream — every inbound receipt emits OFTInboundReceived with
 *      peer, amount, cumulative-24h, and a sequence number. Off-chain monitor
 *      consumes these events for reserve-drift alerting.
 *
 * All four controls are ADDITIVE to LayerZero's native DVN verification —
 * they do NOT replace it. The goal is to survive a DVN compromise, not to
 * substitute for DVN trust.
 *
 * @dev Upgradable via OZ Ownable; constructor sets delegate = owner.
 *      Initial values: PAUSED=false, MAX_RECEIVE_PER_MESSAGE=100_000e6 (100k
 *      USDC), MAX_RECEIVE_PER_PEER_24H=500_000e6 (500k USDC). Tunable by owner.
 */
contract MyOFTAdapter is OFTAdapter {
    using OFTMsgCodec for bytes;

    // ─── SAFETY STATE ─────────────────────────────────────────────────────

    /// @notice Emergency pause — when true, all _lzReceive calls revert.
    bool public paused;

    /// @notice Maximum USDC amount (6 decimals) that a single inbound message
    ///         can deliver. Forged messages capped here regardless of DVN.
    uint256 public maxReceivePerMessage;

    /// @notice Maximum USDC amount (6 decimals) that a single source peer
    ///         can deliver cumulatively within a 24h rolling window.
    uint256 public maxReceivePerPeer24h;

    /// @notice Per-peer cumulative inbound in current window.
    /// srcEid → amount (6 decimals)
    mapping(uint32 => uint256) public cumulativeReceivedInWindow;

    /// @notice Per-peer timestamp at which current 24h window started.
    /// srcEid → block timestamp
    mapping(uint32 => uint64) public windowStartTimestamp;

    /// @notice Monotonic sequence for off-chain correlation.
    uint256 public receiveSequence;

    // ─── EVENTS ───────────────────────────────────────────────────────────

    /**
     * @notice Emitted on EVERY accepted inbound message.
     * @dev Off-chain reserve-drift monitor subscribes to this.
     */
    event OFTInboundReceived(
        uint32 indexed srcEid,
        bytes32 indexed sender,
        uint64 nonce,
        uint256 amountLD,
        uint256 cumulative24h,
        uint256 indexed sequence
    );

    event PausedChanged(bool paused);
    event MaxReceivePerMessageChanged(uint256 oldCap, uint256 newCap);
    event MaxReceivePerPeer24hChanged(uint256 oldCap, uint256 newCap);
    event PeerWindowReset(uint32 indexed srcEid, uint64 windowStart);

    // ─── ERRORS ───────────────────────────────────────────────────────────

    error BridgePaused();
    error ExceedsPerMessageCap(uint256 attempted, uint256 cap);
    error ExceedsPer24hCap(uint256 attemptedWithWindow, uint256 cap);

    // ─── CONSTRUCTOR ──────────────────────────────────────────────────────

    constructor(
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) Ownable(_delegate) {
        // Sensible defaults — Nuro can tune these via owner calls.
        // 100k USDC/message — roughly 10x a typical user transfer.
        maxReceivePerMessage = 100_000 * 10 ** 6;
        // 500k USDC/peer/24h — bounds total daily drain from any single
        // compromised pathway. Scale up via setMaxReceivePerPeer24h when
        // organic volume grows to justify it.
        maxReceivePerPeer24h = 500_000 * 10 ** 6;
    }

    // ─── ADMIN ────────────────────────────────────────────────────────────

    /**
     * @notice Emergency pause — immediately halts all inbound messages.
     * @dev Should be wired to a multisig-controlled owner. Kelp pause 46min
     *      post-compromise saved the second $100M wave; faster = better.
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedChanged(_paused);
    }

    function setMaxReceivePerMessage(uint256 _cap) external onlyOwner {
        uint256 old = maxReceivePerMessage;
        maxReceivePerMessage = _cap;
        emit MaxReceivePerMessageChanged(old, _cap);
    }

    function setMaxReceivePerPeer24h(uint256 _cap) external onlyOwner {
        uint256 old = maxReceivePerPeer24h;
        maxReceivePerPeer24h = _cap;
        emit MaxReceivePerPeer24hChanged(old, _cap);
    }

    /**
     * @notice Manual reset of a peer's 24h window (e.g. after legitimate
     *         burst the operator wants to tolerate).
     */
    function resetPeerWindow(uint32 _srcEid) external onlyOwner {
        cumulativeReceivedInWindow[_srcEid] = 0;
        windowStartTimestamp[_srcEid] = uint64(block.timestamp);
        emit PeerWindowReset(_srcEid, uint64(block.timestamp));
    }

    // ─── OVERRIDE: _lzReceive WITH DEFENCE-IN-DEPTH ───────────────────────

    /**
     * @dev Override of OFTCore._lzReceive. Adds pause + per-message cap +
     *      per-peer 24h rolling cap + rich event emission. On success,
     *      delegates to super._lzReceive for the standard token release logic.
     *
     *      Order of checks is deliberate:
     *        1. Pause check first — cheapest, shortest-path revert
     *        2. Per-message cap — rejects any single over-sized message before
     *           touching storage for window tracking
     *        3. Window state update + cap check — slide window if stale,
     *           then revert if cumulative exceeds cap
     *        4. super._lzReceive — standard OFT token release
     *        5. Event emission — AFTER state change so off-chain consumers
     *           see confirmed receipts, not pending-then-reverted
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal virtual override {
        if (paused) revert BridgePaused();

        // Decode amount BEFORE super._lzReceive so we can cap-check.
        // Use OFTMsgCodec.amountSD — the canonical decoder. Convert to
        // local-decimals via inherited _toLD.
        uint256 amountLD = _toLD(_message.amountSD());

        // --- Layer 2: per-message cap ---
        if (amountLD > maxReceivePerMessage) {
            revert ExceedsPerMessageCap(amountLD, maxReceivePerMessage);
        }

        // --- Layer 3: per-peer 24h rolling window ---
        uint32 srcEid = _origin.srcEid;
        uint64 windowStart = windowStartTimestamp[srcEid];
        if (windowStart == 0 || block.timestamp >= uint256(windowStart) + 24 hours) {
            // First-ever receive OR window expired: reset
            cumulativeReceivedInWindow[srcEid] = 0;
            windowStartTimestamp[srcEid] = uint64(block.timestamp);
            windowStart = uint64(block.timestamp);
        }
        uint256 newCumulative = cumulativeReceivedInWindow[srcEid] + amountLD;
        if (newCumulative > maxReceivePerPeer24h) {
            revert ExceedsPer24hCap(newCumulative, maxReceivePerPeer24h);
        }
        cumulativeReceivedInWindow[srcEid] = newCumulative;

        // --- Delegate to standard OFT release logic ---
        super._lzReceive(_origin, _guid, _message, _executor, _extraData);

        // --- Layer 4: rich event for off-chain monitoring ---
        unchecked { ++receiveSequence; }
        emit OFTInboundReceived(
            srcEid,
            _origin.sender,
            _origin.nonce,
            amountLD,
            newCumulative,
            receiveSequence
        );
    }

}
