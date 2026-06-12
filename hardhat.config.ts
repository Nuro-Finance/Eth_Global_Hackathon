import 'dotenv/config'

import 'hardhat-deploy'
import 'hardhat-contract-sizer'
import '@nomiclabs/hardhat-ethers'
import '@layerzerolabs/toolbox-hardhat'
import { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'

import { EndpointId } from '@layerzerolabs/lz-definitions'

import './type-extensions'
import './tasks/sendOFT'

const MNEMONIC = process.env.MNEMONIC
const PRIVATE_KEY = process.env.PRIVATE_KEY

const accounts: HttpNetworkAccountsUserConfig | undefined = MNEMONIC
    ? { mnemonic: MNEMONIC }
    : PRIVATE_KEY
      ? [PRIVATE_KEY]
      : undefined

if (accounts == null) {
    console.warn(
        'Could not find MNEMONIC or PRIVATE_KEY environment variables. It will not be possible to execute transactions in your example.'
    )
}

const config: HardhatUserConfig = {
    paths: {
        cache: 'cache/hardhat',
    },
    solidity: {
        compilers: [
            {
                version: '0.8.22',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: {
        'base': {
            eid: EndpointId.BASE_V2_MAINNET,
            url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
            accounts,
            oftAdapter: {
                tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            },
        },
        'ethereum': {
            eid: EndpointId.ETHEREUM_V2_MAINNET,
            url: process.env.RPC_URL_ETHEREUM || 'https://eth.llamarpc.com',
            accounts,
        },
        'optimism': {
            eid: EndpointId.OPTIMISM_V2_MAINNET,
            url: process.env.RPC_URL_OPTIMISM || 'https://optimism.llamarpc.com',
            accounts,
        },
        'polygon': {
            eid: EndpointId.POLYGON_V2_MAINNET,
            url: process.env.RPC_URL_POLYGON || 'https://polygon.llamarpc.com',
            accounts,
        },
        'avalanche': {
            eid: EndpointId.AVALANCHE_V2_MAINNET,
            url: process.env.RPC_URL_AVALANCHE || 'https://avalanche.llamarpc.com',
            accounts,
        },

        'arbitrum': {
            eid: EndpointId.ARBITRUM_V2_MAINNET,
            url: process.env.RPC_URL_ARBITRUM || 'https://arbitrum.llamarpc.com',
            accounts,
            oftAdapter: {
                tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            },
        },
        'zksync': {
            eid: EndpointId.ZKSYNC_V2_MAINNET,
            url: process.env.RPC_URL_ZKSYNC || 'https://mainnet.era.zksync.io',
            accounts,
            oftAdapter: {
                tokenAddress: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
            },
        },
        'scroll': {
            eid: EndpointId.SCROLL_V2_MAINNET,
            url: process.env.RPC_URL_SCROLL || 'https://rpc.scroll.io',
            accounts,
            oftAdapter: {
                tokenAddress: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',
            },
        },
        'celo-mainnet': {
            eid: EndpointId.CELO_V2_MAINNET,
            url: process.env.RPC_URL_CELO || 'https://forno.celo.org',
            accounts,
            oftAdapter: {
                tokenAddress: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
            },
        },
        'moonbeam-mainnet': {
            eid: EndpointId.MOONBEAM_V2_MAINNET,
            url: process.env.RPC_URL_MOONBEAM || 'https://rpc.api.moonbeam.network',
            accounts,
            oftAdapter: {
                tokenAddress: '0x931715FEE2d06333043d11F658C8CE934aC61D0c',
            },
        },
        'mode-mainnet': {
            eid: EndpointId.MODE_V2_MAINNET,
            url: process.env.RPC_URL_MODE || 'https://mainnet.mode.network',
            accounts,
            oftAdapter: {
                tokenAddress: '0xd988097fb8612cc24eeC14542bC03424c656005f',
            },
        },
        'mantle-mainnet': {
            eid: EndpointId.MANTLE_V2_MAINNET,
            url: process.env.RPC_URL_MANTLE || 'https://rpc.mantle.xyz',
            accounts,
            oftAdapter: {
                tokenAddress: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9',
            },
        },
        'gnosis-mainnet': {
            eid: EndpointId.GNOSIS_V2_MAINNET,
            url: process.env.RPC_URL_GNOSIS || 'https://rpc.gnosischain.com',
            accounts,
            oftAdapter: {
                tokenAddress: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
            },
        },
        'bsc-mainnet': {
            eid: EndpointId.BSC_V2_MAINNET,
            url: process.env.RPC_URL_BSC || 'https://bsc-dataseed.binance.org',
            accounts,
            oftAdapter: {
                tokenAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            },
        },
        hardhat: {
            allowUnlimitedContractSize: true,
        },
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
}

export default config
