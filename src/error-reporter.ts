/**
 * ─── CENTRALIZED ERROR REPORTER ──────────────────────────────────────────────
 *
 * Routes errors from ALL layers into the execution_log table.
 * Provides a single interface for logging errors that the admin console can query.
 *
 * Layers:
 *   - Intent Layer: DB operations, API validation, auth
 *   - Execution Layer: On-chain transactions, bridge failures, Issuer API
 *   - Frontend Proxy: API proxy errors
 *   - Monitor: Deposit detection, bridge dispatch
 *
 * Usage:
 *   import { reportError, reportWarning } from './error-reporter'
 *   reportError('bridge', 'cctp_transfer', userId, 'CCTP transfer failed', err)
 */

import { Pool } from 'pg'

let dbPool: Pool | null = null

export function initErrorReporter(pool: Pool): void {
  dbPool = pool
}

interface ErrorReport {
  layer: 'intent' | 'execution' | 'monitor' | 'proxy' | 'auth' | 'issuer' | 'bridge' | 'admin'
  action: string
  entityId: string
  detail: string
  error?: Error | string | null
}

async function writeToLog(report: ErrorReport, status: 'failed' | 'skipped'): Promise<void> {
  const errorMessage = report.error
    ? (report.error instanceof Error ? report.error.message : String(report.error))?.slice(0, 500)
    : null

  // Always log to console
  console.error(`[${report.layer}] ${report.action}: ${report.detail}${errorMessage ? ` | ${errorMessage}` : ''}`)

  // Write to execution_log if DB is available
  if (dbPool) {
    try {
      await dbPool.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL, $5, $6, now())`,
        [`error_${report.layer}`, report.entityId, report.action, status, report.detail, errorMessage]
      )
    } catch (dbErr: any) {
      // If we can't write to DB, at least console has it
      console.error('[error-reporter] Failed to write to execution_log:', dbErr.message?.slice(0, 80))
    }
  }
}

/**
 * Report an error — something went wrong that needs attention.
 * Shows up in admin console with status='failed'.
 */
export async function reportError(
  layer: ErrorReport['layer'],
  action: string,
  entityId: string,
  detail: string,
  error?: Error | string | null
): Promise<void> {
  await writeToLog({ layer, action, entityId, detail, error }, 'failed')
}

/**
 * Report a warning — something was skipped or degraded.
 * Shows up in admin console with status='skipped'.
 */
export async function reportWarning(
  layer: ErrorReport['layer'],
  action: string,
  entityId: string,
  detail: string,
  error?: Error | string | null
): Promise<void> {
  await writeToLog({ layer, action, entityId, detail, error }, 'skipped')
}

/**
 * Express error middleware — catches unhandled route errors.
 * Wire into the Express app: app.use(expressErrorHandler)
 */
export function expressErrorHandler(err: any, req: any, res: any, next: any): void {
  const route = `${req.method} ${req.path}`
  const userId = (req as any)?.user?.id || 'anonymous'

  reportError('proxy', route, userId, `Unhandled route error on ${route}`, err)

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' })
  }
}
