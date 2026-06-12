import { ethers } from 'ethers';

const ERC20 = ['function balanceOf(address) view returns (uint256)'];

const CHAINS: [string, string, string][] = [
  ['Ethereum', 'https://eth.llamarpc.com', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
  ['Arbitrum', 'https://arb1.arbitrum.io/rpc', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'],
  ['Base', 'https://mainnet.base.org', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
  ['Polygon', 'https://polygon-rpc.com', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'],
  ['Optimism', 'https://mainnet.optimism.io', '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'],
];

const WALLETS: [string, string][] = [
  // Nuro deployer
  ['Nuro Deployer', '0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC'],
  // Nuro deposit addresses
  ['Nuro RW Deposit', '0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC'],
  ['Nuro Fee Vault', '0x749edFC84A28793ce150d4E7E71bcEe73C454b56'],
  // Corporate
  ['Memetropolis Safe', '0x65f5B35397838C7165A705EA883De4bEB1212b1f'],
  ['GBlock Safe', '0x6C9b06CB243f0fB9a535a90414721deAb9970879'],
  // Issuer ops Base contract
  ['Issuer ops Base Contract', '0x34e81c59B814874611C7FB66661B57E599b4857D'],
];

async function main() {
  console.log('=== WALLET BALANCE CHECK ===\n');

  for (const [walletLabel, walletAddr] of WALLETS) {
    console.log(`--- ${walletLabel} (${walletAddr.slice(0,6)}...${walletAddr.slice(-4)}) ---`);
    let hasBalance = false;

    for (const [chainName, rpc, usdcAddr] of CHAINS) {
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpc);
        const ethBal = await provider.getBalance(walletAddr);
        const usdc = new ethers.Contract(usdcAddr, ERC20, provider);
        const usdcBal = await usdc.balanceOf(walletAddr);

        const ethStr = ethers.utils.formatEther(ethBal);
        const usdcStr = ethers.utils.formatUnits(usdcBal, 6);

        if (parseFloat(ethStr) > 0.0001 || parseFloat(usdcStr) > 0.01) {
          console.log(`  ${chainName}: ${ethStr} ETH | ${usdcStr} USDC`);
          hasBalance = true;
        }
      } catch (e: any) {
        // skip RPC errors silently
      }
    }

    if (!hasBalance) console.log('  (no significant balances found)');
    console.log('');
  }

  // Solana check
  console.log('--- Solana Deployer (5FnaN...c98) ---');
  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getBalance',
        params: ['5FnaNauWeWbgJCF2qxYCyesX3KZLRUecvy7AXmrS47mZ'],
      }),
    });
    const data = await res.json() as any;
    const sol = (data.result?.value || 0) / 1e9;
    console.log(`  SOL: ${sol}`);
  } catch (e: any) {
    console.log(`  Solana ERROR: ${e.message?.slice(0, 60)}`);
  }

  // Solana USDC (SPL token)
  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
        params: [
          '5FnaNauWeWbgJCF2qxYCyesX3KZLRUecvy7AXmrS47mZ',
          { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
          { encoding: 'jsonParsed' },
        ],
      }),
    });
    const data = await res.json() as any;
    const accounts = data.result?.value || [];
    if (accounts.length > 0) {
      const amt = accounts[0].account.data.parsed.info.tokenAmount.uiAmount;
      console.log(`  USDC (SPL): ${amt}`);
    } else {
      console.log('  USDC (SPL): 0');
    }
  } catch (e: any) {
    console.log(`  Solana USDC ERROR: ${e.message?.slice(0, 60)}`);
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
