// ─── HARDENED LAYERZERO CONFIG — SESSION 28 KELP RESPONSE ────────────────
//
// This file is the 2-of-N DVN migration target written in direct response
// to the Kelp DAO exploit (2026-04-18, $292M drained via forged LayerZero
// message that passed a single-DVN attestation). It does NOT replace
// layerzero.config.ts yet — the existing config remains production until:
//
//   (a) Every DVN address below is independently verified against the
//       LayerZero official metadata API:
//           curl https://metadata.layerzero-api.com/v1/metadata | jq ...
//       AND cross-checked via direct eth_call to the DVN contract's
//       `getFee()` method on each chain. "Looks up on docs" is not enough;
//       an adversary could poison a blog post but cannot poison an
//       on-chain contract.
//
//   (b) MyOFTAdapter v2 (the hardened contract at contracts/MyOFTAdapter.sol)
//       is compiled with hardhat/foundry, tested against the existing
//       test suite (if any), and deployed to all 6 chains via hardhat
//       deploy scripts.
//
//   (c) The wire command is run in dry-run mode first:
//           pnpm hardhat lz:oapp:wire --oapp-config layerzero.config.hardened.ts --dry-run
//       Output is eyeballed by the operator before the real wire.
//
//   (d) CONFIG.LZ_BRIDGE_ENABLED is flipped to true in VPS .env.
//
// CRITICAL: DO NOT deploy this file by copy-pasting addresses from any
// web source — including this file — without independent verification.
// The ops on-chain impact of wiring wrong DVN addresses is: messages
// silently fail to verify (bridge becomes unusable), or worse, a message
// is verified by an operator we didn't intend to trust.
//
// See also:
//   - contracts/MyOFTAdapter.sol  — the hardened contract
//   - src/lz-reserve-monitor.ts   — off-chain drift detection
//   - src/config.ts LZ_BRIDGE_ENABLED — kill-switch
//   - LayerZero Kelp incident: https://layerzero.network/blog/kelpdao-incident-statement
//   - LayerZero integration checklist: https://docs.layerzero.network/v2/tools/integration-checklist
//
// ─── LAYERZERO INTEGRATION CHECKLIST COMPLIANCE (Session 30 audit) ────────
//
// Cross-referenced against LZ's official checklist on 2026-04-24. Every
// MANDATORY item is satisfied by the state below or by operational procedure
// (pre-deploy steps in this file header):
//
//   ✓ Peers set bidirectionally — each pathway declares BOTH directions
//     (e.g. zksync→arbitrum AND arbitrum→zksync) in `connections` below.
//     Verify post-deploy via `peers(eid)` read on each OApp.
//   ✓ DVN configuration on all pathways — 2-of-3 on arb/scroll/celo/gnosis/bsc,
//     strict 2-of-2 on zksync (where only 2 DVNs are deployed). Zero 1-of-1
//     pathways. Aligns with LZ Labs' post-Kelp refusal to attest 1/1 apps.
//   ✓ Executor configuration — per-chain executor from LZ_INFRA + explicit
//     maxMessageSize: 10000 on every sendConfig.
//   ✓ Enforced options — EVM_ENFORCED_OPTIONS (80000 gas) +
//     ZKSYNC_ENFORCED_OPTIONS (100000 gas) cover every msgType: 1 (LZ_RECEIVE).
//   ✓ Libraries explicitly set — LZ_INFRA.<chain>.sendLib + receiveLib
//     for every chain; no reliance on LZ defaults. Addresses verified
//     via eth_getCode on 2026-04-22.
//   ✓ Ownership/delegate verification — handled at deploy time in
//     MyOFTAdapter.sol constructor (`_delegate` param). Pre-wire operator
//     MUST transfer to multisig address before flipping LZ_BRIDGE_ENABLED.
//
// RECOMMENDED items we also satisfy (beyond MANDATORY):
//   ✓ Multiple DVNs per pathway (checklist: "best practice" — ours: default)
//   ✓ Latest LayerZero packages (package.json pinned to current stable)
//   ✓ No copy-pasted contracts (we extend OFTAdapter, never vendor in)
//
// Items we EXCEED the checklist on (Kelp-response defense-in-depth —
// none of these are in LZ's checklist; we add them because the Kelp
// incident showed the checklist alone is insufficient):
//   ✓✓ Per-message cap (100k USDC default) in custom _lzReceive
//   ✓✓ Per-peer 24h rolling cap (500k USDC default)
//   ✓✓ Owner pause (setPaused) — single-block lockdown
//   ✓✓ Rich events (OFTInboundReceived) for off-chain monitoring
//   ✓✓ Off-chain reserve reconciliation monitor (5-min cadence)
//   ✓✓ TypeScript-layer kill-switch flag (CONFIG.LZ_BRIDGE_ENABLED)
//
// Items the LZ checklist does NOT cover but Helm (Marathon 8 Corvus
// Layer 4.5) will enforce going forward:
//   → Emergency pause multisig governance
//   → DVN operator independence audit (quarterly)
//   → Credential scope per-call issuance for bridge operator actions
//   → Anomaly detection on send/receive rate envelope

import { EndpointId } from "@layerzerolabs/lz-definitions"
import { ExecutorOptionType } from "@layerzerolabs/lz-v2-utilities"
import { OAppEnforcedOption, OmniPointHardhat } from "@layerzerolabs/toolbox-hardhat"

// ─── CONTRACTS ────────────────────────────────────────────────────────────

const arbitrumContract: OmniPointHardhat = { eid: EndpointId.ARBITRUM_V2_MAINNET, contractName: "MyOFTAdapter" }
const zksyncContract:   OmniPointHardhat = { eid: EndpointId.ZKSYNC_V2_MAINNET,   contractName: "MyOFTAdapter" }
const scrollContract:   OmniPointHardhat = { eid: EndpointId.SCROLL_V2_MAINNET,   contractName: "MyOFTAdapter" }
const celoContract:     OmniPointHardhat = { eid: EndpointId.CELO_V2_MAINNET,     contractName: "MyOFTAdapter" }
const gnosisContract:   OmniPointHardhat = { eid: EndpointId.GNOSIS_V2_MAINNET,   contractName: "MyOFTAdapter" }
const bscContract:      OmniPointHardhat = { eid: EndpointId.BSC_V2_MAINNET,      contractName: "MyOFTAdapter" }

// ─── DVN ADDRESSES (ON-CHAIN VERIFIED 2026-04-22) ─────────────────────────
//
// Each "lzLabs" address below was verified against the live chain via
// eth_getCode on 2026-04-22. All six are confirmed to be deployed
// contracts with bytecode sizes matching LayerZero's DVN template
// (~35,948 bytes on EVM chains; ~122,562 bytes on zkSync due to the
// different VM). Secondary DVNs (nethermind, polyhedra, googleCloud)
// are proposed from LayerZero's metadata API — those MUST be verified
// via eth_getCode before deploy.
//
// CRITICAL FINDINGS DURING VERIFICATION (see commit message + Decision
// Journal for full story):
//
//   • Current prod `layerzero.config.ts` Arbitrum DVN
//       0x23DE2FE932d9043291f870324B74F820e11dc81A — IS NOT A CONTRACT
//       on either Arbitrum or Polygon. The Arbitrum↔zkSync pathway has
//       been dead-on-arrival since deployment. Corrected to
//       0x2f55c492897526677c5b68fb199ea31e2c126416 below.
//
//   • Current prod `layerzero.config.ts` zkSync DVN
//       0x620A9DF73D2F1015eA75aea1067227571A4dE1b5 — TYPO. Last 12 hex
//       chars wrong. Corrected to 0x620a9df73d2f1015ea75aea1067227f9013f5c51.
//
// Scroll, Celo, Gnosis, BSC all match prod config and are verified.
//
// Independence analysis:
//   LZ Labs     — operated by the LayerZero team directly
//   Google Cloud— operated by Google Cloud's infra team
//   Nethermind  — operated by Nethermind (independent consulting firm)
//   Polyhedra   — operated by Polyhedra Network (independent team)
//   Horizen     — operated by Horizen Labs (independent team)
//
// The four above are OPERATIONALLY INDEPENDENT (different companies,
// different signing keys, different hosting infrastructure). A Kelp-style
// multi-DVN compromise would require collusion across teams.

const DVN_PROPOSED = {
    arbitrum: {
        lzLabs:      "0x2f55c492897526677c5b68fb199ea31e2c126416", // VERIFIED 2026-04-22 (35,948 bytes)
        googleCloud: "0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc", // PROPOSED — verify before deploy
        nethermind:  "0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd", // PROPOSED — verify before deploy
        polyhedra:   "0xe014fe8c4d5c23edb7ac4011f226e869ac7ef5cc", // PROPOSED — verify before deploy
    },
    zksync: {
        lzLabs:      "0x620a9df73d2f1015ea75aea1067227f9013f5c51", // VERIFIED 2026-04-22 (122,562 bytes) — FIX for current prod typo
        nethermind:  "0xb183c2b91cf76cad13602b32ada2fd273f19009c", // PROPOSED — verify before deploy
        // Google Cloud + Polyhedra NOT deployed on zkSync per research.
        // If only 2 DVNs available, use 2-of-2 (both required) OR add
        // Horizen Labs as a 3rd independent. Do NOT ship 1-of-2 — same
        // risk class as Kelp's 1-of-1.
    },
    scroll: {
        lzLabs:      "0xbe0d08a85eebfcc6eda0a843521f7cbb1180d2e2", // VERIFIED 2026-04-22 (matches prod, 35,948 bytes)
        nethermind:  "0xb212750bc22d26499dabf3ffe2ba1931dc3af3e1", // PROPOSED — verify before deploy
        polyhedra:   "0x8ddf05f9a5c488b4973897e278b58895bf87cb24", // PROPOSED — verify before deploy
    },
    celo: {
        lzLabs:      "0x75b073994560a5c03cd970414d9170be0c6e5c36", // VERIFIED 2026-04-22 (matches prod, 35,948 bytes)
        googleCloud: "0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc", // PROPOSED — verify before deploy
        nethermind:  "0x6cde6b51d91e9d81b639abb6552e5b1b04d98a0b", // PROPOSED — verify before deploy
        polyhedra:   "0x8ddf05f9a5c488b4973897e278b58895bf87cb24", // PROPOSED — verify before deploy
    },
    gnosis: {
        lzLabs:      "0x11bb2991882a86dc3e38858d922559a385d506ba", // VERIFIED 2026-04-22 (matches prod, 35,948 bytes)
        googleCloud: "0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc", // PROPOSED — verify before deploy
        nethermind:  "0x7fe673201724925b5c477d4e1a4bd3e954688cf5", // PROPOSED — verify before deploy
        polyhedra:   "0x8ddf05f9a5c488b4973897e278b58895bf87cb24", // PROPOSED — verify before deploy
    },
    bsc: {
        lzLabs:      "0xfd6865c841c2d64565562fcc7e05e619a30615f0", // VERIFIED 2026-04-22 (matches prod, 35,948 bytes)
        googleCloud: "0xd56e4eab23cb81f43168f9f45211eb027b9ac7cc", // PROPOSED — verify before deploy
        nethermind:  "0x31f748a368a893bdb5abb67ec95f232507601a73", // PROPOSED — verify before deploy
        polyhedra:   "0xe014fe8c4d5c23edb7ac4011f226e869ac7ef5cc", // PROPOSED — verify before deploy
    },
}

// Library + Executor addresses are NOT being changed — carry over verbatim
// from layerzero.config.ts. Only the DVN set changes.
const LZ_INFRA = {
    standard: { sendLib: "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", receiveLib: "0x2367325334447C5E1E0f1b3a6fB947b262F58312", executor: "0xa20DB4Ffe74A31D17fc24BD32a7DD7555441058e" },
    arbitrum: { sendLib: "0x975bcD720be66659e3EB3C0e4F1866a3020E493A", receiveLib: "0x7B9E184e07a6EE1AC23eAe0fe8D6Be2f663f05e6", executor: "0x31CAe3B7fB82d847621859fb1585353c5720660D" },
    gnosis:   { sendLib: "0x3C156b1f625D2B4E004D43E91aC2c3a719C29c7B", receiveLib: "0x9714Ccf1dedeF14BaB5013625DB92746C1358cb4", executor: "0x38340337f9ADF5D76029Ab3A667d34E5a032F7BA" },
    bsc:      { sendLib: "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", receiveLib: "0x1322871e4ab09Bc7f5717189434f97bBD9546e95", executor: "0xCd3F213AD101472e1713C72B1697E727C803885b" },
    zksync:   { sendLib: "0x07fD0e370B49919cA8dA0CE842B8177263c0E12c", receiveLib: "0x04830f6deCF08Dec9eD6C3fCAD215245B78A59e1", executor: "0x664e390e672A811c12091db8426cBb7d68D5D8A6" },
    scroll:   { sendLib: "0x1e6F2AEa7f69EDDa4eAe9C9B2B4E2d4CA7BFDF9f", receiveLib: "0x8B4c0Dc5AA90c322C747c10FDD7cf1759D343573", executor: "0x4Fc3f4A38Acd6E4cC0ccBc04B3Dd1CAAedBA1a86" },
}

const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    { msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 80000, value: 0 },
]
const ZKSYNC_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    { msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 100000, value: 0 },
]

// ─── DVN SELECTION PER PATHWAY ────────────────────────────────────────────
//
// Policy: 2-of-N required minimum. NO 1-of-1 (Kelp risk class). For chains
// with 3+ DVNs available, we require 1 and make 2 optional with threshold 1
// — net effect: 2 independent attestations required to deliver a message,
// with third-party flexibility for operational resilience. For chains with
// only 2 DVNs (zkSync), require BOTH.

function dvnConfig(required: string[], optional: string[], threshold: number) {
    return {
        confirmations: BigInt(15),
        requiredDVNs: required,
        optionalDVNs: optional,
        optionalDVNThreshold: threshold,
    }
}

// Arbitrum ↔ spoke pathways — 1 required + 2 optional with threshold 1 = 2-of-3
const arbDvnSet = dvnConfig(
    [DVN_PROPOSED.arbitrum.lzLabs],
    [DVN_PROPOSED.arbitrum.nethermind, DVN_PROPOSED.arbitrum.googleCloud],
    1
)

// zkSync only has 2 DVNs — REQUIRE both
const zksyncDvnSet = dvnConfig(
    [DVN_PROPOSED.zksync.lzLabs, DVN_PROPOSED.zksync.nethermind],
    [],
    0
)

const scrollDvnSet = dvnConfig(
    [DVN_PROPOSED.scroll.lzLabs],
    [DVN_PROPOSED.scroll.nethermind, DVN_PROPOSED.scroll.polyhedra],
    1
)
const celoDvnSet = dvnConfig(
    [DVN_PROPOSED.celo.lzLabs],
    [DVN_PROPOSED.celo.nethermind, DVN_PROPOSED.celo.googleCloud],
    1
)
const gnosisDvnSet = dvnConfig(
    [DVN_PROPOSED.gnosis.lzLabs],
    [DVN_PROPOSED.gnosis.nethermind, DVN_PROPOSED.gnosis.googleCloud],
    1
)
const bscDvnSet = dvnConfig(
    [DVN_PROPOSED.bsc.lzLabs],
    [DVN_PROPOSED.bsc.nethermind, DVN_PROPOSED.bsc.googleCloud],
    1
)

// ─── PAYLOAD ──────────────────────────────────────────────────────────────

export default async function () {
    return {
        contracts: [
            { contract: arbitrumContract },
            { contract: zksyncContract },
            { contract: scrollContract },
            { contract: celoContract },
            { contract: gnosisContract },
            { contract: bscContract },
        ],
        connections: [
            // ─── zkSync ↔ Arbitrum ──────────────────────────────────────
            {
                from: zksyncContract, to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.zksync.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.zksync.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.zksync.executor },
                        ulnConfig: zksyncDvnSet,
                    },
                    receiveConfig: { ulnConfig: zksyncDvnSet },
                },
            },
            {
                from: arbitrumContract, to: zksyncContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: arbDvnSet,
                    },
                    receiveConfig: { ulnConfig: arbDvnSet },
                },
            },
            // ─── Scroll ↔ Arbitrum ──────────────────────────────────────
            {
                from: scrollContract, to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.scroll.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.scroll.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.scroll.executor },
                        ulnConfig: scrollDvnSet,
                    },
                    receiveConfig: { ulnConfig: scrollDvnSet },
                },
            },
            {
                from: arbitrumContract, to: scrollContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: arbDvnSet,
                    },
                    receiveConfig: { ulnConfig: arbDvnSet },
                },
            },
            // ─── Celo ↔ Arbitrum ────────────────────────────────────────
            {
                from: celoContract, to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.standard.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.standard.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.standard.executor },
                        ulnConfig: celoDvnSet,
                    },
                    receiveConfig: { ulnConfig: celoDvnSet },
                },
            },
            {
                from: arbitrumContract, to: celoContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: arbDvnSet,
                    },
                    receiveConfig: { ulnConfig: arbDvnSet },
                },
            },
            // ─── Gnosis ↔ Arbitrum ──────────────────────────────────────
            {
                from: gnosisContract, to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.gnosis.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.gnosis.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.gnosis.executor },
                        ulnConfig: gnosisDvnSet,
                    },
                    receiveConfig: { ulnConfig: gnosisDvnSet },
                },
            },
            {
                from: arbitrumContract, to: gnosisContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: arbDvnSet,
                    },
                    receiveConfig: { ulnConfig: arbDvnSet },
                },
            },
            // ─── BSC ↔ Arbitrum ─────────────────────────────────────────
            {
                from: bscContract, to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.bsc.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.bsc.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.bsc.executor },
                        ulnConfig: bscDvnSet,
                    },
                    receiveConfig: { ulnConfig: bscDvnSet },
                },
            },
            {
                from: arbitrumContract, to: bscContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: arbDvnSet,
                    },
                    receiveConfig: { ulnConfig: arbDvnSet },
                },
            },
        ],
        enforcedOptions: {
            zksync: ZKSYNC_ENFORCED_OPTIONS,
            default: EVM_ENFORCED_OPTIONS,
        },
    }
}
