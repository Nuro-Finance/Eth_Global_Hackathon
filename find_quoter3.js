const {ethers} = require('ethers')
const p = new ethers.providers.JsonRpcProvider('https://rpc.hyperliquid.xyz/evm')

const QUOTER_V1_ABI = [
  'function factory() view returns (address)',
  'function WETH9() view returns (address)',
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'
]

const WHYPE = '0x5555555555555555555555555555555555555555'
const USDC  = '0xbe6727b535545c67d5caa73dea19b7c5cc3d9b9e'

// These are addresses listed on HyperEVMScan under HyperSwap label
const candidates = [
  '0x4e2960a8cd19b467b82d26d83facb0fae26b094d', // Router1 - known
  '0x6D99e7f6747AF2cDbB5164b6DD50e40D4fDe1e77', // Router2 - known
  '0x724412c00059bf7d6ee7d4a1d0d5cd4de3ea1c48', // old factory candidate
  '0xB1c0fa0B789320044A6F623cFe5eBda9562602E3', // confirmed factory
  '0xAc8B7c9B5B2D7E1e3F2d4C6a8B9d0E1F2A3B4C5D', // placeholder
  '0x04B2A9F2f9A89e3BbcB2c1f3e4D5a6B7c8D9E0F1', // placeholder
]

async function probe(addr) {
  try {
    const code = await p.getCode(addr)
    if (code === '0x') { console.log('NO CODE:', addr); return }
    const c = new ethers.Contract(addr, QUOTER_V1_ABI, p)
    const quoted = await c.callStatic.quoteExactInputSingle(
      WHYPE, USDC, 3000, ethers.utils.parseEther('0.01'), 0
    )
    console.log('QUOTER FOUND:', addr, 'quote:', ethers.utils.formatUnits(quoted, 6), 'USDC')
  } catch(e) {
    const msg = e.message || ''
    if (msg.includes('revert') || msg.includes('0x')) {
      console.log('POSSIBLE (revert - pool may not exist):', addr)
    } else {
      console.log('NOT quoter:', addr, msg.slice(0, 50))
    }
  }
}

;(async () => {
  for (const a of candidates) await probe(a)
})()
