require('dotenv').config({path: '/home/nuro/Nuro-Finance/.env'})
const { ethers } = require('ethers')

const WALLETS = [
  { label: 'Deployer', addr: '0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC' },
  { label: 'Other',    addr: '0x337c623fF3634b1dD2f64Ca3674aaFdB0cbdf7b4' },
]

const CHAINS = [
  { name: 'Ethereum',   rpc: process.env.RPC_URL_ETHEREUM,  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'ETH' },
  { name: 'Base',       rpc: process.env.BASE_RPC_URL,       usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'ETH' },
  { name: 'Arbitrum',   rpc: process.env.RPC_URL_ARBITRUM,   usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'ETH' },
  { name: 'Optimism',   rpc: process.env.RPC_URL_OPTIMISM,   usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'ETH' },
  { name: 'Polygon',    rpc: process.env.RPC_URL_POLYGON,    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'MATIC' },
  { name: 'Avalanche',  rpc: process.env.RPC_URL_AVALANCHE,  usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', symbol: 'AVAX' },
  { name: 'Linea',      rpc: 'https://rpc.linea.build',       usdc: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', symbol: 'ETH' },
  { name: 'Unichain',   rpc: 'https://mainnet.unichain.org',  usdc: '0x078D782b760474a361dDA97Af2ac95aC5c13F40A', symbol: 'ETH' },
  { name: 'Sonic',      rpc: 'https://rpc.soniclabs.com',     usdc: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894', symbol: 'S' },
  { name: 'WorldChain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public', usdc: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1', symbol: 'ETH' },
  { name: 'Ink',        rpc: 'https://rpc-gel.inkonchain.com', usdc: '0xF1815bd50389c46847f0Bda824eC8da914045D14', symbol: 'ETH' },
  { name: 'zkSync',     rpc: process.env.RPC_URL_ZKSYNC,     usdc: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', symbol: 'ETH' },
  { name: 'Scroll',     rpc: process.env.RPC_URL_SCROLL,     usdc: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', symbol: 'ETH' },
]

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)']

async function checkChain(chain, walletAddr) {
  try {
    const p = new ethers.providers.JsonRpcProvider(chain.rpc)
    const usdc = new ethers.Contract(chain.usdc, ERC20_ABI, p)
    const [native, usdcBal] = await Promise.all([
      p.getBalance(walletAddr),
      usdc.balanceOf(walletAddr)
    ])
    const nativeFmt = parseFloat(ethers.utils.formatEther(native)).toFixed(5)
    const usdcFmt   = parseFloat(ethers.utils.formatUnits(usdcBal, 6)).toFixed(4)
    return { native: nativeFmt, usdc: usdcFmt }
  } catch(e) {
    return { native: 'ERR', usdc: 'ERR' }
  }
}

async function main() {
  for (const wallet of WALLETS) {
    console.log(`\n====== ${wallet.label}: ${wallet.addr} ======`)
    console.log(`${'Chain'.padEnd(12)} ${'Native'.padEnd(12)} ${'USDC'.padEnd(10)}`)
    console.log('-'.repeat(36))
    const results = await Promise.allSettled(CHAINS.map(c => checkChain(c, wallet.addr)))
    for (let i = 0; i < CHAINS.length; i++) {
      const r = results[i].value || { native: 'ERR', usdc: 'ERR' }
      const hasVal = r.usdc !== '0.0000' && r.usdc !== 'ERR'
      const flag = hasVal ? ' ◀' : ''
      console.log(`${CHAINS[i].name.padEnd(12)} ${r.native.padEnd(12)} ${r.usdc}${flag}`)
    }
  }
}
main().catch(console.error)
