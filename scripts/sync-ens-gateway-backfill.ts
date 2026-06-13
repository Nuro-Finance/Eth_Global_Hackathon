#!/usr/bin/env tsx
/**
 * Push existing ens_claims rows to the CCIP gateway (D1).
 * Use after first gateway deploy or when backfilling PG → D1.
 *
 *   doppler run -- npx tsx scripts/sync-ens-gateway-backfill.ts
 */
import { pool } from "../src/db";
import { syncEnsClaimToGateway } from "../src/lib/ens/gatewaySync";

async function main() {
  const res = await pool.query<{
    full_name: string;
    address: string;
    visibility: "public" | "private";
  }>(`SELECT full_name, address, visibility FROM ens_claims ORDER BY created_at ASC`);

  if (res.rows.length === 0) {
    console.log("No ens_claims rows to sync.");
    return;
  }

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of res.rows) {
    const result = await syncEnsClaimToGateway({
      fullName: row.full_name,
      address: row.address,
      visibility: row.visibility,
    });

    if (result.status === "synced") {
      synced += 1;
      console.log(`✓ ${row.full_name}`);
    } else if (result.status === "skipped") {
      skipped += 1;
      console.log(`– skipped (set ENS_GATEWAY_URL + ENS_GATEWAY_SIGNER_PRIVATE_KEY)`);
      break;
    } else {
      failed += 1;
      console.error(`✗ ${row.full_name}: ${result.error}`);
    }
  }

  console.log(`Done: synced=${synced} skipped=${skipped} failed=${failed}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
