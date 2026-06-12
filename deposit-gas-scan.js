require('dotenv').config({path: '/home/nuro/Nuro-Finance/.env'})
const { ethers } = require('ethers')

const DEPOSIT = '0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC'

const CHAINS = [
  { name: 'Ethereum',   rpc: process.env.RPC_URL_ETHEREUM,  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { name: 'Base',       rpc: process.env.BASE_RPC_URL,       usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  { name: 'Arbitrum',   rpc: process.env.RPC_URL_ARBITRUM,   usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
  { name: 'Optimism',   rpc: process.env.RPC_URL_OPTIMISM,   usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
  { name: 'Polygon',    rpc: process.env.RPC_URL_POLYGON,    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  { name: 'Avalanche',  rpc: process.env.RPC_URL_AVALANCHE,  usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
  { name: 'Linea',      rpc: 'https://rpc.linea.build',       usdc: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff' },
  { name: 'Unichain',   rpc: 'https://mainnet.unichain.org',  usdc: '0x078D782b760474a361dDA97Af2ac95aC5c13F40A' },
  { name: 'Sonic',      rpc: 'https://rpc.soniclabs.com',     usdc: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894' },
  { name: 'WorldChain', rpc: 'https://worldchain-mainnet.g.alchemy.com/public', usdc: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' },
  { name: 'Ink',        rpc: 'https://rpc-gel.inkonchain.com', usdc: '0xF1815bd50389c46847f0Bda824eC8da914045D14' },
  { name: 'zkSync',     rpc: process.env.RPC_URL_ZKSYNC,     usdc: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4' },
  { name: 'Scroll',     rpc: process.env.RPC_URL_SCROLL,     usdc: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4' },
]
const ERC20 = ['function balanceOf(address) view returns (uint256)']

async function main() {
  console.log(`Deposit address: ${DEPOSIT}\n`)
  console.log(`${'Chain'.padEnd(12)} ${'Gas'.padEnd(14)} ${'USDC'.padEnd(10)} Status`)
  console.log('-'.repeat(52))
  const results = await Promise.allSettled(CHAINS.map(async c => {
    const p = new ethers.providers.JsonRpcProvider(c.rpc)
    const [gas, usdc] = await Promise.all([
      p.getBalance(DEPOSIT),
      new ethers.Contract(c.usdc, ERC20, p).balanceOf(DEPOSIT)
    ])
    return { name: c.name, gas: ethers.utils.formatEther(gas), usdc: ethers.utils.formatUnits(usdc, 6) }
  }))
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { name, gas, usdc } = r.value
      const gasOk  = parseFloat(gas) > 0.00005
      const usdcOk = parseFloat(usdc) > 0
      const status = usdcOk ? '✅ READY' : gasOk ? '⛽ needs USDC' : '❌ needs gas+USDC'
      console.log(`${name.padEnd(12)} ${parseFloat(gas).toFixed(6).padEnd(14)} ${parseFloat(usdc).toFixed(4).padEnd(10)} ${status}`)
    } else {
      console.log(`${r.reason?.config?.url?.slice(0,12).padEnd(12)} ERR`)
    }
  }
}
main().catch(console.error)
