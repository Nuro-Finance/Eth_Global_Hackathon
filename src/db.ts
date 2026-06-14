import { Pool } from 'pg';
import { CONFIG } from './config';

// Defensive: tolerate missing POSTGRES_URL at module-load (e.g., test env
// importing modules that transitively pull db.ts without ever querying).
// Real callers will fail loudly on first query if connection isn't real.
const rawPgUrl = CONFIG.POSTGRES_URL || ''
const pgUrl = rawPgUrl
  ? (rawPgUrl.includes('statement_timeout')
      ? rawPgUrl
      : rawPgUrl + (rawPgUrl.includes('?') ? '&' : '?') + 'statement_timeout=30000')
  : 'postgresql://localhost:5432/__unconfigured__'

// Supabase + any other managed-Postgres provider requires SSL. We auto-detect
// from the connection string so the same code works against local Postgres
// (no SSL) and Supabase (SSL required) without env-var gymnastics.
// rejectUnauthorized: false because Supabase uses a self-signed cert chain
// behind their pooler - verifying would fail. The TLS itself is real, just
// the cert chain isn't trusted by Node's default CA bundle.
const needsSSL = /supabase\.(com|co)|sslmode=require/i.test(pgUrl);

export const pool = new Pool({
  connectionString: pgUrl,
  max: 10,                       // Share Postgres connections fairly with index.ts pool
  idleTimeoutMillis: 30000,      // Close idle connections after 30s
  connectionTimeoutMillis: 10000, // Fail fast if can't connect in 10s
  ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db-pool-monitor] Unexpected error on idle client:', err.message?.slice(0, 100))
})

export async function getDepositAddress(
  userId: string,
  chain: 'evm' | 'solana' | 'hype' | 'base' | 'base-issuer'
): Promise<{ address: string; privateKey?: string } | null> {
  const res = await pool.query(
    'SELECT address, private_key FROM deposit_addresses WHERE user_id = $1 AND chain = $2',
    [userId, chain]
  );
  if (res.rows.length === 0) return null;
  return { address: res.rows[0].address, privateKey: res.rows[0].private_key };
}

export async function saveDepositAddress(
  userId: string,
  chain: 'evm' | 'solana' | 'hype' | 'base' | 'base-issuer',
  address: string,
  privateKey?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO deposit_addresses (user_id, chain, address, private_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, chain) DO NOTHING`,
    [userId, chain, address, privateKey ?? null]
  );
}
