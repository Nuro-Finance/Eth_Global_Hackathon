/**
 * Demo account seeder for the May 14 capital-event pitch.
 *
 * Idempotent: each run wipes existing demo data then re-inserts a fresh
 * deterministic state. Safe to re-run mid-demo if anything corrupts.
 *
 * What it seeds:
 *   - 1 user: demo@nuro.finance / Nuro-Demo-2026$$$  (KYC pre-approved)
 *   - 1 card: VISA, $1,247.30 balance, real-looking PAN + expiry
 *   - 17 card transactions across the last 30 days (mix of income +
 *     groceries / transport / food / shopping / subscriptions / travel)
 *
 * The dashboard will populate end-to-end once the user logs in:
 *   /api/cards         -> 1 card visible in the deck
 *   /api/transactions  -> 17 rows in the transactions list
 *   useCashFlowData    -> bucket-aggregated income + expense charts
 *   useAccountBalance  -> $1,247.30 card balance
 *
 * Run from the VPS:
 *   ssh nuro@74.50.109.203 "cd ~/Nuro-Finance && npx tsx scripts/seed-demo-account.ts"
 *
 * Run locally (requires POSTGRES_URL in env):
 *   POSTGRES_URL="postgresql://..." npx tsx scripts/seed-demo-account.ts
 */

import * as bcrypt from "bcrypt";
import * as dotenv from "dotenv";
import { Pool } from "pg";

// Load env from .env.local first (Next.js convention), fall back to .env
// (backend src/config.ts convention). Either naming works on the VPS.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// ─── Demo account constants ─────────────────────────────────────────────
const DEMO_EMAIL = "demo@nuro.finance";
const DEMO_PASSWORD = "Nuro-Demo-2026$$$";
const DEMO_NAME = "Demo Account";
// Stable UUIDs so re-runs replace existing rows cleanly. Distinctive prefix
// so a human spotting these in logs / DB recognizes them as demo data.
const DEMO_USER_ID = "11111111-2222-3333-4444-555555555555";

// Three cards so the overview deck stack + drag-to-rotate animation works.
// Chris's design assumes a 3-card stack; with 1 card the deck collapses to a
// flat single-tier and the swipe gesture has nothing to rotate to.
type DemoCard = {
  id: string;
  number: string;
  expiry: string;
  balance: number;
  gradient: string;
  cardType: "VISA" | "NOIR";
};

// Gradient strings come from src/lib/cardSkins.ts -- resolveNuroCardFaceIdFromGradient
// maps these to /cards/nuro-card-{black,blue,purple}.png face assets.
const NOIR_GRADIENT   = "linear-gradient(135deg, #1a1a1a 0%, #333333 100%)";
const BLUE_GRADIENT   = "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)";
const PURPLE_GRADIENT = "linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)";

const DEMO_CARDS: DemoCard[] = [
  // Primary -- holds all transactions
  {
    id: "11111111-aaaa-bbbb-cccc-dddddddddddd",
    number: "4242 4242 4242 4242",
    expiry: "12/28",
    balance: 1247.30,
    gradient: NOIR_GRADIENT,
    cardType: "VISA",
  },
  // Secondary -- savings/secondary spending card
  {
    id: "11111111-aaaa-bbbb-cccc-eeeeeeeeeeee",
    number: "5678 5678 5678 5678",
    expiry: "08/27",
    balance: 520.42,
    gradient: BLUE_GRADIENT,
    cardType: "VISA",
  },
  // Tertiary -- agent / experimental card
  {
    id: "11111111-aaaa-bbbb-cccc-ffffffffffff",
    number: "1234 1234 1234 1234",
    expiry: "06/29",
    balance: 412.18,
    gradient: PURPLE_GRADIENT,
    cardType: "VISA",
  },
];
const PRIMARY_CARD_ID = DEMO_CARDS[0].id;

const DEMO_CARD_HOLDER = "DEMO ACCOUNT";

// ─── Realistic transaction history (last 30 days) ──────────────────────
// daysAgo = how many days ago the transaction occurred (0 = today)
// Mix of income + outgoing across categories. Designed so the cash-flow
// chart populates with believable bumps when bucketed Daily / Weekly / Monthly.
type SeedTx = {
  daysAgo: number;
  name: string;
  type: string;
  amount: number;
  isIncoming: boolean;
  category: string;
};

const TRANSACTIONS: SeedTx[] = [
  // INCOME (USDC reloads from various chains -- demo's funding source)
  { daysAgo: 28, name: "USDC Deposit (Base)",       type: "deposit",      amount: 2500.00, isIncoming: true,  category: "income" },
  { daysAgo: 14, name: "USDC Deposit (Arbitrum)",   type: "deposit",      amount: 1500.00, isIncoming: true,  category: "income" },
  { daysAgo: 4,  name: "USDC Deposit (Optimism)",   type: "deposit",      amount:  750.00, isIncoming: true,  category: "income" },

  // GROCERIES
  { daysAgo: 27, name: "Whole Foods Market",        type: "purchase",     amount:   87.42, isIncoming: false, category: "groceries" },
  { daysAgo: 10, name: "Trader Joe's",              type: "purchase",     amount:   54.30, isIncoming: false, category: "groceries" },
  { daysAgo: 3,  name: "Whole Foods Market",        type: "purchase",     amount:   94.20, isIncoming: false, category: "groceries" },

  // TRANSPORT
  { daysAgo: 25, name: "Uber",                      type: "purchase",     amount:   12.50, isIncoming: false, category: "transport" },
  { daysAgo: 17, name: "Shell Gas Station",         type: "purchase",     amount:   45.20, isIncoming: false, category: "transport" },
  { daysAgo: 8,  name: "Uber",                      type: "purchase",     amount:   22.40, isIncoming: false, category: "transport" },
  { daysAgo: 2,  name: "Lyft",                      type: "purchase",     amount:   15.80, isIncoming: false, category: "transport" },

  // FOOD
  { daysAgo: 20, name: "Starbucks",                 type: "purchase",     amount:    6.75, isIncoming: false, category: "food" },
  { daysAgo: 12, name: "Sushi Yasuda",              type: "purchase",     amount:   67.50, isIncoming: false, category: "food" },
  { daysAgo: 6,  name: "Blue Bottle Coffee",        type: "purchase",     amount:    8.50, isIncoming: false, category: "food" },

  // SHOPPING
  { daysAgo: 22, name: "Apple Store",               type: "purchase",     amount: 1299.00, isIncoming: false, category: "shopping" },
  { daysAgo: 15, name: "Amazon",                    type: "purchase",     amount:  129.99, isIncoming: false, category: "shopping" },

  // SUBSCRIPTIONS
  { daysAgo: 24, name: "Spotify Premium",           type: "subscription", amount:   10.99, isIncoming: false, category: "entertainment" },
  { daysAgo: 19, name: "Netflix",                   type: "subscription", amount:   15.99, isIncoming: false, category: "entertainment" },
  { daysAgo: 5,  name: "ChatGPT Plus",              type: "subscription", amount:   20.00, isIncoming: false, category: "subscription" },

  // TRAVEL (one big-ish recent expense)
  { daysAgo: 1,  name: "Airbnb",                    type: "purchase",     amount:  420.00, isIncoming: false, category: "travel" },
];

// ─── Run ────────────────────────────────────────────────────────────────
async function seed(): Promise<void> {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("FATAL: POSTGRES_URL env var not set. Aborting.");
    process.exit(1);
  }

  const needsSSL = /supabase\.(com|co)|sslmode=require/i.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10000,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log(`\nSeeding demo account: ${DEMO_EMAIL}`);
    console.log(`Connecting to: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

    // 1. Wipe existing demo data (idempotent re-run)
    console.log("→ Wiping existing demo data...");
    await pool.query("DELETE FROM card_transactions WHERE user_id = $1", [DEMO_USER_ID]);
    await pool.query("DELETE FROM cards WHERE user_id = $1", [DEMO_USER_ID]);
    // Keep notifications / agents if they exist; the FK constraints will tolerate
    // missing user (we'll reinsert with the same id immediately).
    await pool.query(
      "DELETE FROM users WHERE id = $1 OR email = $2",
      [DEMO_USER_ID, DEMO_EMAIL],
    );
    console.log("  wiped.");

    // 2. Insert demo user (KYC pre-approved so the banner doesn't pester)
    console.log("→ Creating user...");
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash, kyc_status, email_verified)
       VALUES ($1, $2, $3, $4, 'approved', FALSE)`,
      [DEMO_USER_ID, DEMO_EMAIL, DEMO_NAME, passwordHash],
    );
    console.log(`  user ${DEMO_USER_ID} created`);

    // 3. Insert 3 demo cards (noir / blue / purple) for the stack visual
    console.log(`→ Creating ${DEMO_CARDS.length} cards...`);
    for (const card of DEMO_CARDS) {
      await pool.query(
        `INSERT INTO cards (
           id, user_id, card_number, card_holder, expiry_date,
           card_type, gradient, balance, is_active, is_locked
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false)`,
        [
          card.id,
          DEMO_USER_ID,
          card.number,
          DEMO_CARD_HOLDER,
          card.expiry,
          card.cardType,
          card.gradient,
          card.balance,
        ],
      );
      const skinName = card.gradient.includes("#1a1a1a") ? "noir"
                     : card.gradient.includes("#1e3a8a") ? "blue"
                     : card.gradient.includes("#4c1d95") ? "purple"
                     : "default";
      console.log(`  ${skinName} card $${card.balance} (...${card.number.slice(-4)})`);
    }

    // 4. Insert transactions
    console.log(`→ Seeding ${TRANSACTIONS.length} transactions...`);
    const now = new Date();
    let inserted = 0;
    for (const tx of TRANSACTIONS) {
      const date = new Date(now);
      date.setDate(date.getDate() - tx.daysAgo);
      // Spread within the day so chart bars don't all stack at midnight
      date.setHours(9 + (tx.daysAgo % 12), (tx.daysAgo * 13) % 60, 0, 0);

      await pool.query(
        `INSERT INTO card_transactions (
           user_id, card_id, name, type, amount, is_incoming,
           date, category, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')`,
        [
          DEMO_USER_ID,
          PRIMARY_CARD_ID,
          tx.name,
          tx.type,
          tx.amount,
          tx.isIncoming,
          date.toISOString(),
          tx.category,
        ],
      );
      inserted++;
    }
    console.log(`  ${inserted} transactions seeded (all on primary card)`);

    const totalBalance = DEMO_CARDS.reduce((s, c) => s + c.balance, 0);
    console.log("\n─────────────────────────────────────────────────────");
    console.log("✓ Demo account ready");
    console.log("─────────────────────────────────────────────────────");
    console.log(`  Email:    ${DEMO_EMAIL}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    console.log(`  Cards:    ${DEMO_CARDS.length} (noir / blue / purple)`);
    console.log(`  Total $:  $${totalBalance.toFixed(2)}`);
    console.log(`  Tx count: ${inserted}`);
    console.log(`  KYC:      approved`);
    console.log("\nLogin at https://app.nuro.finance/en/auth/login\n");
  } catch (err: any) {
    console.error("\nFATAL:", err?.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void seed();
