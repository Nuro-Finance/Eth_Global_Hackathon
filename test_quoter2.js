const {ethers} = require('ethers')
const p = new ethers.providers.JsonRpcProvider('https://rpc.hyperliquid.xyz/evm')

const QUOTER_V2 = '0x03A918028f22D9E1473B7959C927AD7425A45C7C'
const WHYPE = '0x5555555555555555555555555555555555555555'
const USDC  = '0xb88339cb7199b77e23db6e890353e22632ba630f'

const ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
]

const q = new ethers.Contract(QUOTER_V2, ABI, p)

;(async () => {
  // Try multiple fee tiers - 500 (0.05%), 3000 (0.3%), 10000 (1%)
  for (const fee of [500, 3000, 10000]) {
    try {
      const result = await q.callStatic.quoteExactInputSingle({
        tokenIn: WHYPE,
        tokenOut: USDC,
        amountIn: ethers.utils.parseEther('1'),
        fee,
        sqrtPriceLimitX96: 0
      })
      console.log(`fee ${fee}: 1 WHYPE => ${ethers.utils.formatUnits(result.amountOut, 6)} USDC`)
    } catch(e) {
      console.log(`fee ${fee}: no pool or revert`)
    }
  }
})()
