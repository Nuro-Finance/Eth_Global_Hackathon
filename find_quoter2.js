const {ethers} = require('ethers')
const p = new ethers.providers.JsonRpcProvider('https://rpc.hyperliquid.xyz/evm')

const KNOWN_FACTORY = '0xB1c0fa0B789320044A6F623cFe5eBda9562602E3'.toLowerCase()
const QUOTER_ABI = ['function factory() view returns (address)', 'function WETH9() view returns (address)']

const candidates = [
  '0x14dc4B6260FFDA12706227C30965a503553b707a',
  '0x70A230D49d4178798a43779f82524b3ADD61CDe3',
  '0x78063eA2b31aD8bF99bb61300aD7AB64BC2AC42D',
  '0x3AE0817c04095D2b3134e76Ccdc533C42ed3BC98',
  '0x7a5c1395666A4D2cb93c19D1BFCC4eC3e359E7Cc',
  '0x71876DFA23B2Be8a2374F2e5329E7643434bE815',
  '0xA7A145112ad12FB732BEc0Ed17d1959C13638F2a',
  '0x41Cf7dde923CadF2390a858bF82F4C9809b72B7a',
  '0xCBC648F8EaF602aE1c59EF076e016fcc95aa2530',
  '0xA297129B6a0F7C442DDaE45b129B50f917018262',
  '0x861bF0911989d76DE1C2Fd0CB26dd0835F8787E6',
  '0xcF852BE28aD2A1794ea8F1e3c870797fCc431DBF',
  '0xE71eE1eE4A58C488045899a5D1b88c410703Ce75',
  '0xa63a60cC93c300C3daD2f27f8bc3E1F9052C48C5',
  '0xd98feC6D4460330c12646EaE7c81f9Da85F6198b',
]

async function check(addr) {
  const code = await p.getCode(addr)
  if (code === '0x') return
  console.log('HAS CODE:', addr, 'len:', code.length)
  const c = new ethers.Contract(addr, QUOTER_ABI, p)
  try {
    const f = await c.factory()
    console.log('  factory():', f, f.toLowerCase() === KNOWN_FACTORY ? '<-- MATCH' : '')
  } catch(e) { console.log('  no factory()') }
  try {
    const w = await c.WETH9()
    console.log('  WETH9():', w)
  } catch(e) {}
}

;(async () => { for (const a of candidates) await check(a) })()
