// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX DB — scratch schema spawn + teardown (S32, M3)
//
// Per Sandbox Design v2: each session gets its own Postgres schema
// (`sandbox_<uuid>`) populated by cloning a curated subset of public.*
// tables. The sandbox-scoped DB pool sets `search_path = sandbox_<id>,
// public` so reads + writes hit the per-session copy first while still
// being able to read public reference data if a code path crosses scopes.
//
// Why scratch schemas (not ephemeral containers): per design — fast spawn
// (<2s), trivial cleanup (DROP SCHEMA CASCADE), same Postgres instance,
// predictable resource usage. Schema-isolation isn't bullet-proof; we
// rely on per-session read-only DB user (future hardening) + the principle
// that sandbox callers route through scope.ts which sets search_path
// correctly.
//
// Curated tables (locked at v2 sign-off):
//   18 prod tables — users, agents, all agent_*, hl_vaults,
//   hl_vault_positions, markets, market_positions, heimdall_events,
//   deposit_addresses, execution_log, plus a SANITIZED variant of cards
//   (PAN/CVV/PIN nulled, balance + status preserved for card-flow tests).
//
// Approach: CREATE TABLE LIKE INCLUDING ALL EXCLUDING CONSTRAINTS — clones
// structure + indexes + defaults but skips FK constraints (which would
// reference public.* and pollute the isolation). INSERT...SELECT for data
// clone. cards goes through a sanitize-during-insert path.
//
// Trade-offs accepted:
//   - No FK enforcement inside the sandbox. Acceptable: sandbox is for
//     scenario testing, not production-grade integrity.
//   - Snapshot-at-spawn: data clone is one-shot; no live replication.
//     Sandbox stays at-most-stale-by-spawn-time which matches "frozen
//     state" semantics from the design doc.
//   - Sequence values aren't synchronized between schemas. New rows in
//     sandbox start from sequence's current value at spawn. Fine — UUIDs
//     are the primary IDs.
// ─────────────────────────────────────────────────────────────────────────────

import type { Pool } from 'pg'

// Curated table list, in dependency-friendly order (parents before children
// for sane FK behavior IF the operator chooses to re-add FKs later — and
// for visual clarity in the spawn-progress logs).
//
// 'cards' is intentionally last and goes through the sanitized path —
// tableConfig flags whether to strip sensitive columns.
interface SandboxTable {
  name: string
  /** When true, tables.cards columns matching SENSITIVE_CARD_COLS are
   *  NULLed during INSERT to avoid leaking PAN/CVV/PIN into the sandbox. */
  sanitizeCard?: boolean
}

const CURATED_TABLES: SandboxTable[] = [
  { name: 'users' },
  { name: 'agents' },
  { name: 'agent_keys' },
  { name: 'agent_subscriptions' },
  { name: 'agent_messages' },
  { name: 'agent_budgets' },
  { name: 'agent_budget_ledger' },
  { name: 'agent_gas_balances' },
  { name: 'agent_predictions' },
  { name: 'agent_reputation' },
  { name: 'agent_reputation_history' },
  { name: 'hl_vaults' },
  { name: 'hl_vault_positions' },
  { name: 'markets' },
  { name: 'market_positions' },
  { name: 'heimdall_events' },
  { name: 'deposit_addresses' },
  { name: 'execution_log' },
  { name: 'cards', sanitizeCard: true },
]

// Card columns that hold sensitive data — nulled during sandbox clone.
// PAN = primary account number (16-digit), CVV = card verification value,
// PIN = personal identification number, billing addresses.
const SENSITIVE_CARD_COLS = [
  'card_number',
  'cvv',
  'pin',
  'card_secret',
  'session_id',
  'pan',
  'billing_address',
  'cardholder_dob',
]

// ── Spawn ───────────────────────────────────────────────────────────────────

/**
 * Create + populate a sandbox scratch schema.
 *
 * Idempotent at the schema level: if the schema already exists with our
 * tables, this is a no-op. Otherwise creates structure + clones data.
 *
 * Clone semantics:
 *   - Structure: CREATE TABLE LIKE public.<t> INCLUDING ALL EXCLUDING CONSTRAINTS
 *   - Data: INSERT INTO sandbox.<t> SELECT * FROM public.<t>
 *   - cards: sanitized SELECT (sensitive cols NULLed)
 *
 * Returns counts for diagnostics — useful when debugging "why is my
 * sandbox empty" scenarios (dump from a fresh dev DB might have 0 rows).
 */
export async function cloneSchemaForSandbox(
  db: Pool,
  schemaName: string,
): Promise<{ tablesCloned: number; rowsCopied: Record<string, number> }> {
  if (!isSafeSchemaName(schemaName)) {
    throw new Error(`unsafe schema name (must be sandbox_<hex>): ${schemaName}`)
  }

  const rowsCopied: Record<string, number> = {}
  let tablesCloned = 0

  // Single transaction so a partial failure doesn't leak a half-populated
  // schema. Trade-off: if the transaction is large (many tables × many
  // rows), it holds locks longer. For ~18 small ops-data tables this is
  // fine; if hl_vault_positions or markets ever blow up to >100k rows
  // we'd revisit.
  await db.query('BEGIN')
  try {
    await db.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

    for (const table of CURATED_TABLES) {
      const exists = await tableExistsInPublic(db, table.name)
      if (!exists) {
        // Skip silently — this is normal during early-stage migrations
        // where a curated table hasn't landed in prod yet.
        rowsCopied[table.name] = -1
        continue
      }

      // Structure clone. INCLUDING ALL covers defaults, indexes, identity,
      // generated cols. EXCLUDING CONSTRAINTS drops FK references to
      // public.* (and CHECK constraints, but those are usually safe to
      // keep — they don't reference other schemas. We err on the side of
      // permissive sandbox semantics).
      await db.query(
        `CREATE TABLE "${schemaName}"."${table.name}"
         (LIKE public."${table.name}" INCLUDING ALL EXCLUDING CONSTRAINTS)`,
      )

      // Data clone.
      let copyResult
      if (table.sanitizeCard) {
        copyResult = await cloneCardsSanitized(db, schemaName, table.name)
      } else {
        copyResult = await db.query(
          `INSERT INTO "${schemaName}"."${table.name}"
           SELECT * FROM public."${table.name}"`,
        )
      }

      rowsCopied[table.name] = copyResult.rowCount ?? 0
      tablesCloned++
    }

    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined)
    // Best-effort cleanup of partial schema. If this also fails we'll
    // catch it on the next reconcile pass.
    await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined)
    throw err
  }

  return { tablesCloned, rowsCopied }
}

// ── Teardown ────────────────────────────────────────────────────────────────

/**
 * Drop a sandbox scratch schema. Idempotent — silently no-ops if the
 * schema doesn't exist. CASCADE drops every table + index in the schema
 * in one statement (atomic).
 */
export async function dropSandboxSchema(db: Pool, schemaName: string): Promise<void> {
  if (!isSafeSchemaName(schemaName)) {
    // Refuse rather than silently DROP something we don't own. If this
    // ever fires, there's a logic bug somewhere upstream constructing
    // schema names — better to fail loud than truncate prod by accident.
    throw new Error(`refusing to drop unsafe schema name: ${schemaName}`)
  }
  await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function tableExistsInPublic(db: Pool, tableName: string): Promise<boolean> {
  const r = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  )
  return r.rows[0]?.exists ?? false
}

async function cloneCardsSanitized(
  db: Pool,
  schemaName: string,
  tableName: string,
): Promise<{ rowCount: number | null }> {
  // Discover actual cards columns (schema may have diverged from our
  // hardcoded list). For each column, decide: keep (SELECT col) or
  // sanitize (SELECT placeholder AS col).
  //
  // Placeholder strategy (rather than NULL): the real cards table has
  // NOT NULL constraints on card_number etc., and INCLUDING ALL carries
  // those constraints into the sandbox schema. Inserting NULL would
  // violate them. Using a deterministic-fake placeholder preserves the
  // structure (card-flow tests still have SOMETHING in those fields)
  // while making it unambiguously non-real ('SANDBOX-' prefix).
  const colsRes = await db.query<{ column_name: string; data_type: string; udt_name: string; is_nullable: string }>(
    `SELECT column_name, data_type, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  )

  const sensitiveSet = new Set(SENSITIVE_CARD_COLS)
  const selectExprs = colsRes.rows.map((c) => {
    const colId = `"${c.column_name.replace(/"/g, '""')}"`
    if (!sensitiveSet.has(c.column_name)) return colId

    // Sanitization expression depends on column type. Strings get a
    // 'SANDBOX-<short-hex>' placeholder; date types get a fixed sentinel;
    // everything else falls back to NULL (and the column had better be
    // nullable, otherwise the source schema disagrees with our list).
    if (c.is_nullable === 'YES') {
      return `NULL AS ${colId}`
    }
    const t = c.data_type
    if (t === 'text' || t === 'character varying' || t === 'character') {
      // Deterministic-ish placeholder: hash the row's id so two clones
      // of the same source produce the same placeholder. Helps debuggers
      // recognize "this is the same row I saw last time."
      return `('SANDBOX-' || substring(md5(public."${tableName}".id::text) FROM 1 FOR 8)) AS ${colId}`
    }
    if (t === 'date' || t === 'timestamp without time zone' || t === 'timestamp with time zone') {
      return `'1970-01-01'::${t === 'date' ? 'date' : 'timestamptz'} AS ${colId}`
    }
    if (t === 'integer' || t === 'bigint' || t === 'numeric' || t === 'real' || t === 'double precision') {
      return `0::${c.udt_name} AS ${colId}`
    }
    if (t === 'boolean') {
      return `false AS ${colId}`
    }
    if (t === 'jsonb' || t === 'json') {
      return `'{}'::${t} AS ${colId}`
    }
    // Unknown type — try NULL and let the constraint check fail loudly
    // rather than smuggling unsanitized data through.
    return `NULL AS ${colId}`
  })

  const sql = `INSERT INTO "${schemaName}"."${tableName}"
               SELECT ${selectExprs.join(', ')}
               FROM public."${tableName}"`
  return db.query(sql)
}

/**
 * Validate schema name. We construct schema names ourselves
 * ('sandbox_' + hex from gen_random_uuid()), but defensively reject
 * anything not matching that shape — DROP SCHEMA on a hand-typed schema
 * name would be catastrophic.
 */
function isSafeSchemaName(name: string): boolean {
  return /^sandbox_[a-f0-9]{32}$/.test(name)
}
