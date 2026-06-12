import { EndpointId } from "@layerzerolabs/lz-definitions"
import { ExecutorOptionType } from "@layerzerolabs/lz-v2-utilities"
import { OAppEnforcedOption, OmniPointHardhat } from "@layerzerolabs/toolbox-hardhat"
import { Options } from "@layerzerolabs/lz-v2-utilities"

// Architecture: OFTAdapter on BOTH ends. No synthetics. Real USDC only.
// Flow: exotic chain -> Arbitrum (LZ) -> Base (CCTP V2) -> Issuer credits card

const arbitrumContract: OmniPointHardhat = {
    eid: EndpointId.ARBITRUM_V2_MAINNET,
    contractName: "MyOFTAdapter",
}

const zksyncContract: OmniPointHardhat = {
    eid: EndpointId.ZKSYNC_V2_MAINNET,
    contractName: "MyOFTAdapter",
}

const scrollContract: OmniPointHardhat = {
    eid: EndpointId.SCROLL_V2_MAINNET,
    contractName: "MyOFTAdapter",
}

// Deployed adapters — peers wired via direct setPeer() calls on 3-14-2026
const celoContract: OmniPointHardhat = {
    eid: EndpointId.CELO_V2_MAINNET,
    contractName: "MyOFTAdapter",
}

const gnosisContract: OmniPointHardhat = {
    eid: EndpointId.GNOSIS_V2_MAINNET,
    contractName: "MyOFTAdapter",
}

const bscContract: OmniPointHardhat = {
    eid: EndpointId.BSC_V2_MAINNET,
    contractName: "MyOFTAdapter",
}

// Not yet deployed — remove from contracts list until funded and deployed
// moonbeamContract, modeContract, mantleContract

// LayerZero Labs DVN addresses per chain (confirmed from LZ deployment registry + metadata API)
// CRITICAL: Gnosis & BSC use DIFFERENT executor/library addresses from the standard set.
//           Using standard addresses on those chains will silently fail (they're EOAs, not contracts).
const DVN = {
    arbitrum: "0x23DE2FE932d9043291f870324B74F820e11dc81A",
    zksync:   "0x620A9DF73D2F1015eA75aea1067227571A4dE1b5",
    scroll:   "0xbe0d08a85EeBFCC6eDA0A843521f7CBB1180D2e2",
    celo:     "0x75b073994560a5c03cd970414d9170be0c6e5c36",
    gnosis:   "0x11bb2991882a86dc3e38858d922559a385d506ba",
    bsc:      "0xfd6865c841c2d64565562fcc7e05e619a30615f0",
}

// Per-chain library & executor addresses (most share the standard set, but Gnosis and BSC diverge)
const LZ_INFRA = {
    // Standard set (Scroll, Celo, and most EVM chains)
    standard: {
        sendLib:    "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043",
        receiveLib: "0x2367325334447C5E1E0f1b3a6fB947b262F58312",
        executor:   "0xa20DB4Ffe74A31D17fc24BD32a7DD7555441058e",
    },
    // Arbitrum
    arbitrum: {
        sendLib:    "0x975bcD720be66659e3EB3C0e4F1866a3020E493A",
        receiveLib: "0x7B9E184e07a6EE1AC23eAe0fe8D6Be2f663f05e6",
        executor:   "0x31CAe3B7fB82d847621859fb1585353c5720660D",
    },
    // Gnosis — UNIQUE addresses (standard set are EOAs on Gnosis!)
    gnosis: {
        sendLib:    "0x3C156b1f625D2B4E004D43E91aC2c3a719C29c7B",
        receiveLib: "0x9714Ccf1dedeF14BaB5013625DB92746C1358cb4",
        executor:   "0x38340337f9ADF5D76029Ab3A667d34E5a032F7BA",
    },
    // BSC — shares SendUln302 with standard, but ReceiveUln302 and Executor differ
    bsc: {
        sendLib:    "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043",
        receiveLib: "0x1322871e4ab09Bc7f5717189434f97bBD9546e95",
        executor:   "0xCd3F213AD101472e1713C72B1697E727C803885b",
    },
    // zkSync
    zksync: {
        sendLib:    "0x07fD0e370B49919cA8dA0CE842B8177263c0E12c",
        receiveLib: "0x04830f6deCF08Dec9eD6C3fCAD215245B78A59e1",
        executor:   "0x664e390e672A811c12091db8426cBb7d68D5D8A6",
    },
    // Scroll
    scroll: {
        sendLib:    "0x1e6F2AEa7f69EDDa4eAe9C9B2B4E2d4CA7BFDF9f",
        receiveLib: "0x8B4c0Dc5AA90c322C747c10FDD7cf1759D343573",
        executor:   "0x4Fc3f4A38Acd6E4cC0ccBc04B3Dd1CAAedBA1a86",
    },
}

const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 80000,
        value: 0,
    },
]

const ZKSYNC_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 100000,
        value: 0,
    },
]

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
            // zkSync -> Arbitrum (user send direction)
            {
                from: zksyncContract,
                to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.zksync.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.zksync.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.zksync.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.zksync],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.zksync],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },
            // Arbitrum -> zkSync (return direction, needed for peer wiring)
            {
                from: arbitrumContract,
                to: zksyncContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },
            // Scroll -> Arbitrum
            {
                from: scrollContract,
                to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.scroll.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.scroll.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.scroll.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.scroll],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.scroll],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },
            // Arbitrum -> Scroll
            {
                from: arbitrumContract,
                to: scrollContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },

            // ── CELO ↔ ARBITRUM ──────────────────────────────────────────────
            // Celo uses standard LZ infra addresses (same as Scroll)
            {
                from: celoContract,
                to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.standard.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.standard.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.standard.executor },
                        ulnConfig: {
                            confirmations: BigInt(5),
                            requiredDVNs: [DVN.celo],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(5),
                            requiredDVNs: [DVN.celo],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },
            {
                from: arbitrumContract,
                to: celoContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },

            // ── GNOSIS ↔ ARBITRUM ────────────────────────────────────────────
            // CRITICAL: Gnosis uses UNIQUE library/executor addresses!
            // Standard addresses are EOAs on Gnosis — they will NOT work.
            {
                from: gnosisContract,
                to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.gnosis.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.gnosis.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.gnosis.executor },
                        ulnConfig: {
                            confirmations: BigInt(20),
                            requiredDVNs: [DVN.gnosis],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(20),
                            requiredDVNs: [DVN.gnosis],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },
            {
                from: arbitrumContract,
                to: gnosisContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },

            // ── BSC ↔ ARBITRUM ───────────────────────────────────────────────
            // BSC shares SendUln302 with standard, but ReceiveUln302 + Executor differ
            {
                from: bscContract,
                to: arbitrumContract,
                config: {
                    sendLibrary: LZ_INFRA.bsc.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.bsc.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.bsc.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.bsc],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.bsc],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },
            {
                from: arbitrumContract,
                to: bscContract,
                config: {
                    sendLibrary: LZ_INFRA.arbitrum.sendLib,
                    receiveLibraryConfig: { receiveLibrary: LZ_INFRA.arbitrum.receiveLib, gracePeriod: BigInt(0) },
                    sendConfig: {
                        executorConfig: { maxMessageSize: 10000, executor: LZ_INFRA.arbitrum.executor },
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                    receiveConfig: {
                        ulnConfig: {
                            confirmations: BigInt(15),
                            requiredDVNs: [DVN.arbitrum],
                            optionalDVNs: [],
                            optionalDVNThreshold: 0,
                        },
                    },
                },
            },
        ],
    }
}
