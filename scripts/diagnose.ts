import { ethers } from 'ethers';
import { getUserBaseDepositAddress, onboardUser } from '../src/issuers';
import { CONFIG } from '../src/config';

const ERC20 = ['function balanceOf(address) view returns (uint256)'];

async function main() {
  console.log('\n=== CARD ISSUER API STATUS ===');

  const probeIds = (process.env.ISSUER_DIAGNOSE_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!probeIds.length) {
    console.log('Set ISSUER_DIAGNOSE_USER_IDS=uuid1,uuid2 to probe issuer deposit addresses.');
  } else {
    for (const uid of probeIds) {
      try {
        const addr = await getUserBaseDepositAddress(uid);
        console.log(`${uid}: OK — Base addr: ${addr}`);
      } catch (e: any) {
        console.log(`${uid}: ERROR ${e?.response?.status || 'N/A'} — ${e?.response?.data?.message || e?.message}`);
      }
    }
  }

  console.log('\n=== DEPLOYER WALLET ===');
  const pk = process.env.PRIVATE_KEY;
  if (!pk) { console.log('ERROR: PRIVATE_KEY not set'); return; }
  const wallet = new ethers.Wallet(pk);
  console.log('Address:', wallet.address);

  for (const [name, rpc, usdc] of [
    ['Arbitrum', 'https://arb1.arbitrum.io/rpc', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'],
    ['Base', 'https://mainnet.base.org', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
    ['Ethereum', 'https://eth.llamarpc.com', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
  ] as const) {
    try {
      const p = new ethers.providers.JsonRpcProvider(rpc);
      const eth = await p.getBalance(wallet.address);
      const c = new ethers.Contract(usdc, ERC20, p);
      const usdcBal = await c.balanceOf(wallet.address);
      console.log(`${name} | ETH: ${ethers.utils.formatEther(eth)} | USDC: ${ethers.utils.formatUnits(usdcBal, 6)}`);
    } catch (e: any) {
      console.log(`${name} ERROR: ${e.message?.slice(0, 80)}`);
    }
  }

  console.log('\n=== DEPOSIT ADDRESS BALANCES ===');
  for (const [label, rpc, usdc, addr] of [
    ['RW-Deposit-Eth', 'https://eth.llamarpc.com', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC'],
    ['Nuro-Deposit-Eth', 'https://eth.llamarpc.com', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xaBcc89d0aD4Cf75eB4e8d3729B25c8B26eB1f0F4'],
    ['FeeVault-Base', 'https://mainnet.base.org', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', '0x749edFC84A28793ce150d4E7E71bcEe73C454b56'],
  ] as const) {
    try {
      const p = new ethers.providers.JsonRpcProvider(rpc);
      const c = new ethers.Contract(usdc, ERC20, p);
      const bal = await c.balanceOf(addr);
      console.log(`${label}: ${ethers.utils.formatUnits(bal, 6)} USDC at ${addr}`);
    } catch (e: any) {
      console.log(`${label} ERROR: ${e.message?.slice(0, 80)}`);
    }
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
