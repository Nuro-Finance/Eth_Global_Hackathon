/**
 * Dev-only: wipe a user by email so you can re-signup and test fresh onboarding.
 *
 * Usage:
 *   doppler run -- npm run wipe:dev-user -- redhawk@example.com
 *   POSTGRES_URL="postgresql://..." npx tsx scripts/wipe-dev-user.ts user@example.com
 *
 * After running, in the browser (logged-out or before re-signup):
 *   - Clear site localStorage/sessionStorage for localhost:2800, OR
 *   - DevTools → Application → Clear site data
 *
 * Does NOT touch Issuer / Privy / Stripe — local Nuro DB + OTP rows only.
 */

import * as dotenv from "dotenv";
import { Pool } from "pg";
import { DEMO_WIPE_EMAIL, wipeUserData } from "../src/lib/wipe-user-data";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function printBrowserCleanup(userId: string, email: string): void {
  console.log("\nBrowser cleanup (before re-signup):");
  console.log("  1. Sign out of Nuro if still logged in");
  console.log("  2. DevTools → Application → Storage → Clear site data for localhost:2800");
  console.log("     Or remove these keys manually:");
  console.log(`       localStorage: nuro_account_onboarding_${userId}`);
  console.log(`       localStorage: nuro_setup_notifications_dismissed_${userId}`);
  console.log("       sessionStorage: nuro_pending_onboarding");
  console.log("       sessionStorage: nuro_require_wallet_relink");
  console.log(`       sessionStorage/cookie: nuro_welcome_seen (user id was ${userId})`);
  console.log(`  3. Sign up again with ${email}\n`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: wipe-dev-user is dev-only. Refusing to run in production.");
    process.exit(1);
  }

  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const force = process.argv.includes("--force");
  const email = args[0]?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    console.error("Usage: npm run wipe:dev-user -- <email>");
    console.error("Example: npm run wipe:dev-user -- redhawk@example.com");
    process.exit(1);
  }

  if (email === DEMO_WIPE_EMAIL && !force) {
    console.error(
      `Refusing to wipe ${DEMO_WIPE_EMAIL}. Re-seed with: npm run seed:demo`,
    );
    console.error("Pass --force if you really mean it.");
    process.exit(1);
  }

  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("FATAL: POSTGRES_URL not set. Use doppler run -- ...");
    process.exit(1);
  }

  const needsSSL = /supabase\.(com|co)|sslmode=require/i.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10000,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();

  try {
    console.log(`\nWiping dev user: ${email}`);
    console.log(`DB: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

    const lookup = await client.query<{ id: string; name: string | null }>(
      "SELECT id, name FROM users WHERE lower(email) = lower($1)",
      [email],
    );

    if (lookup.rowCount === 0) {
      console.log("No user found with that email — already clean.");
      console.log("You can sign up fresh with this email.\n");
      return;
    }

    const user = lookup.rows[0];
    console.log(`Found user id=${user.id} name=${user.name ?? "(none)"}\n`);

    await wipeUserData(client, user.id, email);

    console.log("\nDone. User removed from DB.");
    printBrowserCleanup(user.id, email);
  } catch (err) {
    console.error("\nWipe failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
