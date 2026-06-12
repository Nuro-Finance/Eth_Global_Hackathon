/**
 * Richard's-account companion to seed-demo-account.ts.
 *
 * Adds 2 phantom cards (blue + purple) to richardthebrucewayne@gmail.com so
 * the overview deck-stack visual + drag-to-rotate animation works on the
 * personal account too -- not just the demo account.
 *
 * Idempotent: deletes existing phantoms by ID before re-inserting. Does
 * NOT touch the user's existing primary card or any transactions on it.
 *
 * Run from VPS:
 *   ssh nuro@74.50.109.203 "cd ~/Nuro-Finance && npm run seed:extra-cards"
 */

import * as bcrypt from "bcrypt"; // unused but kept for parity; remove if linter complains
import * as dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const RICHARD_EMAIL = "richardthebrucewayne@gmail.com";
// Stable phantom-card UUIDs so re-runs don't accumulate duplicates.
const PHANTOM_CARDS = [
  {
    id: "22222222-bbbb-cccc-dddd-eeeeeeeeeeee",
    number: "5678 5678 5678 5678",
    expiry: "08/27",
    balance: 520.42,
    gradient: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
    skin: "blue",
  },
  {
    id: "22222222-bbbb-cccc-dddd-ffffffffffff",
    number: "1234 1234 1234 1234",
    expiry: "06/29",
    balance: 412.18,
    gradient: "linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)",
    skin: "purple",
  },
];

async function run() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("FATAL: POSTGRES_URL not set");
    process.exit(1);
  }

  // unused-import workaround
  void bcrypt;

  const needsSSL = /supabase\.(com|co)|sslmode=require/i.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10000,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log(`\nLooking up user: ${RICHARD_EMAIL}`);
    const userRes = await pool.query(
      "SELECT id, name FROM users WHERE email = $1",
      [RICHARD_EMAIL],
    );
    if (userRes.rowCount === 0) {
      throw new Error(`User ${RICHARD_EMAIL} not found in users table`);
    }
    const userId = userRes.rows[0].id as string;
    const userName = (userRes.rows[0].name as string) || "Richard";
    console.log(`  found: ${userId} (${userName})\n`);

    // Wipe phantoms by ID (don't touch primary or anything else).
    // Cast id::text on the column side so this works whether cards.id is
    // declared as UUID or VARCHAR in the live schema (production reality
    // differs from Schema doc -- id was VARCHAR there as of S35).
    console.log("→ Removing previous phantom cards (if any)...");
    const phantomIds = PHANTOM_CARDS.map((c) => c.id);
    await pool.query(
      `DELETE FROM cards WHERE id::text = ANY($1::text[])`,
      [phantomIds],
    );
    console.log("  cleared.");

    console.log(`→ Adding ${PHANTOM_CARDS.length} phantom cards...`);
    for (const card of PHANTOM_CARDS) {
      await pool.query(
        `INSERT INTO cards (
           id, user_id, card_number, card_holder, expiry_date,
           card_type, gradient, balance, is_active, is_locked
         ) VALUES ($1, $2, $3, $4, $5, 'VISA', $6, $7, true, false)`,
        [
          card.id,
          userId,
          card.number,
          userName.toUpperCase(),
          card.expiry,
          card.gradient,
          card.balance,
        ],
      );
      console.log(`  ${card.skin} card $${card.balance} (...${card.number.slice(-4)})`);
    }

    // Print final card count for verification
    const countRes = await pool.query(
      "SELECT COUNT(*) AS n FROM cards WHERE user_id = $1",
      [userId],
    );
    const total = countRes.rows[0].n;

    console.log("\n─────────────────────────────────────────────────────");
    console.log(`✓ Added ${PHANTOM_CARDS.length} phantoms to ${RICHARD_EMAIL}`);
    console.log("─────────────────────────────────────────────────────");
    console.log(`  Total cards on account: ${total}`);
    console.log("\nLog in / hard-refresh the dashboard -- 3-card deck stack should now");
    console.log("appear and the drag-to-rotate animation should match Chris's video.\n");
  } catch (err: any) {
    console.error("\nFATAL:", err?.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void run();
