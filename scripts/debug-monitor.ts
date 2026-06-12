import { ethers } from 'ethers';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const res = await pool.query("SELECT user_id, address FROM deposit_addresses WHERE chain = 'evm'");
  console.log('Total EVM deposit addresses:', res.rows.length);

  const rpc = process.env.RPC_URL_ETHEREUM;
  console.log('Ethereum RPC:', rpc);

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const usdc = new ethers.Contract(
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  // Check each address on Ethereum
  console.log('\n--- Checking Ethereum USDC balances ---');
  for (const row of res.rows) {
    try {
      const bal = await usdc.balanceOf(row.address);
      const formatted = ethers.utils.formatUnits(bal, 6);
      console.log(`  ${row.user_id.slice(0,8)}... ${row.address}: ${formatted} USDC`);
    } catch(e: any) {
      console.log(`  ${row.user_id.slice(0,8)}... ${row.address}: ERROR ${e.message?.slice(0,80)}`);
    }
  }

  // Now check what lastSeen would look like for this address
  console.log('\n--- Checking existing transactions for 72459d0e on chain 1 ---');
  const txRes = await pool.query(
    "SELECT id, source_chain, amount, status FROM transactions WHERE user_id IN (SELECT id FROM users WHERE issuer_user_id = '72459d0e-8705-4b5d-bb40-904e4ae8a3a1') AND source_chain = 1"
  );
  console.log('Existing chain 1 transactions:', txRes.rows.length);
  for (const r of txRes.rows) {
    console.log(`  ${r.id.slice(0,8)}... amount=${r.amount} status=${r.status}`);
  }

  // Check the lastSeen seed query
  console.log('\n--- Simulating seedLastSeenFromDb ---');
  const seedRes = await pool.query(
    "SELECT user_wallet, source_chain, MAX(amount) as max_amount FROM transactions WHERE status IN ('confirmed','failed','pending') GROUP BY user_wallet, source_chain"
  );
  console.log('Seeded entries:', seedRes.rows.length);
  for (const r of seedRes.rows) {
    console.log(`  wallet=${r.user_wallet?.slice(0,10)}... chain=${r.source_chain} max=${r.max_amount}`);
  }

  await pool.end();
  console.log('\nDone');
}

main().catch(console.error);
