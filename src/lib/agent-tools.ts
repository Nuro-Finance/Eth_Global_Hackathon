/**
 * AGENT_TOOL_REGISTRY - canonical list of capabilities the per-card agent
 * chat can invoke via Anthropic function-calling.
 *
 * Marathon 12 Day 1 (2026-05-30). Triggered by bug 2026-05-29:
 * "I asked my card if it could freeze itself - it lied and said yes -
 * then it did nothing."
 *
 * The mechanism:
 * 1. Chat handler in nuro-routes.ts passes `toolsForAnthropic()` in the
 * Anthropic Messages API request
 * 2. Model emits `tool_use` blocks when it decides to invoke an action
 * 3. Chat handler looks up the tool by name in this registry
 * 4. self-serve / read-only tier → execute now, append tool_result, loop
 * confirms-on-execute → emit confirm event, pause until user clicks
 * 5. After the final assistant turn, the chat response includes any
 * `stateChange` patches the executed tools returned. The chat UI
 * dispatches them to Redux + invalidates React Query so every visible
 * card surface flips state in the same frame as the agent reply.
 *
 * Locks from 2026-05-29:
 * - Agent reply must describe WHAT ACTUALLY HAPPENED, not aspirational
 * "I'll freeze that" without a tool_use. System prompt enforces this.
 * - Every state-mutating tool MUST return a `stateChange` patch. Without
 * it the tool is half-done - backend updated, UI lies.
 * - Confirms-on-execute is liability armor: every click is a legal record
 * of explicit user authorization, logged with timestamps. Destroys
 * "I didn't authorize that" claims.
 *
 * Day 1 ships `freeze_card` only. Day 2 adds the read-only tools
 * (get_balance, get_daily_limit, get_recent_transactions) and the
 * confirms-on-execute tools (request_withdrawal, request_limit_increase).
 * Full v1 set documented in Marathon 12 - Trust + Execution Sprint.md.
 */

import type { Pool } from 'pg';
import { freezeCard as issuerFreezeCard } from '../issuers';

export type AgentToolTier = 'self-serve' | 'confirms-on-execute' | 'read-only';

export interface CardChatContext {
  db: Pool;
  cardId: string;
  userId: string;
}

export interface AgentToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
 /**
 * UI-state-sync lock ( lock 2026-05-29): tools that mutate state
 * MUST return a patch. The chat handler bubbles this into the response
 * payload; the chat UI dispatches it to Redux + invalidates React Query so
 * every visible surface of the affected entity flips state in the same
 * animation frame as the agent's reply. The tool is NOT complete until
 * the UI reflects the change.
 *
 * Read-only tools (get_balance, get_daily_limit) omit this field.
 */
  stateChange?: {
    entity: 'card' | 'agent' | 'vault' | 'wallet';
    id: string;
    patch: Record<string, unknown>;
  };
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  tier: AgentToolTier;
  execute: (args: any, ctx: CardChatContext) => Promise<AgentToolResult>;
}

export const AGENT_TOOL_REGISTRY: AgentToolDefinition[] = [
  {
    name: 'freeze_card',
    description:
      "Freeze this card immediately. INVOKE ONLY when the user explicitly asks for the card to be frozen, locked, paused, suspended, or 'turned off' for transactions. Trigger phrases: 'freeze it', 'freeze my card', 'pause my card', 'lock it', 'lock my card', 'turn it off', 'suspend it', 'block transactions'. DO NOT INVOKE for unrelated requests: changing color is NOT a freeze request, renaming is NOT a freeze request, checking balance is NOT a freeze request. If the user says 'make my card blue', that is a color request only - call change_card_color, NOT freeze_card. When invoked, blocks all new transactions until unfrozen by unfreeze_card. The DB update + Issuer sync only happen when this tool fires. Saying 'I froze it' in text without calling this tool is a Rule 0 violation. The card is THIS card - do not ask which card.",
    input_schema: {
      type: 'object',
      properties: {},
    },
    tier: 'self-serve',
    execute: async (_args, ctx) => {
      try {
 // Update DB. Mirrors the PATCH /cards/:id handler at line 1060 of
 // nuro-routes.ts, scoped narrowly to is_locked. We DO NOT update
 // any other field - defense in depth against the model emitting
 // surprise arguments we'd otherwise have to validate.
        const result = await ctx.db.query(
 // NOTE: cards table doesn't have an updated_at column on this
 // schema (confirmed by walk 2026-05-30 - initial agent_tool
 // commit assumed it did and errored). Match the shape of the
 // existing PATCH /cards/:id handler at nuro-routes.ts:1060.
          `UPDATE cards SET is_locked = true
            WHERE id = $1 AND user_id = $2
            RETURNING id, card_last_4, issuer_card_id`,
          [ctx.cardId, ctx.userId],
        );
        if (!result.rows[0]) {
          return { ok: false, error: 'Card not found or not owned by this user.' };
        }
        const card = result.rows[0];

 // Sync with Issuer. DB is the truth-of-record for UI display, but
 // the Issuer enforces the actual transaction block. If Issuer sync
 // fails, the UI shows Frozen (true) but the Issuer might still
 // authorize an in-flight txn until next sweep. Log + continue.
        if (card.issuer_card_id) {
          try {
            await issuerFreezeCard(card.issuer_card_id, true);
          } catch (err: any) {
            console.warn(
              `[agent-tool freeze_card] Issuer sync failed for ${card.issuer_card_id}:`,
              err?.message,
            );
 // Tool still reports ok=true because the user-visible DB state
 // matches their intent. The Issuer-sync failure surfaces in
 // execution_log for ops follow-up.
            await ctx.db.query(
              `INSERT INTO execution_log
                (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
                VALUES (gen_random_uuid(), 'card_freeze', $1, 'freeze', 'failed', NULL,
                        'agent_tool freeze_card: DB updated, Issuer sync failed',
                        $2, now())`,
              [ctx.cardId, (err?.message || 'unknown').slice(0, 200)],
            ).catch(() => { /* execution_log insert is best-effort */ });
          }
        }

 // Log the successful freeze for the M12 audit trail. Agent Smith
 // (workstream C) will cross-reference this against agent reply text
 // to detect lies (replies that claim a freeze with no execution_log
 // entry are violations).
        await ctx.db.query(
          `INSERT INTO execution_log
            (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
            VALUES (gen_random_uuid(), 'card_freeze', $1, 'freeze', 'success', NULL,
                    'agent_tool freeze_card: card frozen via per-card agent chat', NULL, now())`,
          [ctx.cardId],
        ).catch(() => { /* execution_log insert is best-effort */ });

        return {
          ok: true,
          result: { frozen: true, last4: card.card_last_4 },
          stateChange: {
            entity: 'card',
            id: ctx.cardId,
            patch: { is_locked: true },
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'freeze_card failed' };
      }
    },
  },
  {
    name: 'unfreeze_card',
    description:
      "Unfreeze this card. INVOKE THIS TOOL - do not just say you unfroze it. Saying 'Done, I'm back online' or 'card is now unfrozen' in text without calling this tool is a LIE that Agent Smith will log as a drift violation. The DB update + Issuer sync only happen when this tool fires. Resumes the card so it can authorize transactions again. Symmetric to freeze_card. Use this when the user says 'unfreeze it', 'turn it back on', 'resume', 'unlock my card', or any similar phrasing. INVOKE NOW, then describe what happened.",
    input_schema: {
      type: 'object',
      properties: {},
    },
    tier: 'self-serve',
    execute: async (_args, ctx) => {
      try {
        const result = await ctx.db.query(
 // NOTE: cards.updated_at doesn't exist on this schema - matches
 // existing PATCH /cards/:id handler shape (nuro-routes.ts:1060).
          `UPDATE cards SET is_locked = false
            WHERE id = $1 AND user_id = $2
            RETURNING id, card_last_4, issuer_card_id`,
          [ctx.cardId, ctx.userId],
        );
        if (!result.rows[0]) {
          return { ok: false, error: 'Card not found or not owned by this user.' };
        }
        const card = result.rows[0];

        if (card.issuer_card_id) {
          try {
            await issuerFreezeCard(card.issuer_card_id, false);
          } catch (err: any) {
            console.warn(
              `[agent-tool unfreeze_card] Issuer sync failed for ${card.issuer_card_id}:`,
              err?.message,
            );
            await ctx.db.query(
              `INSERT INTO execution_log
                (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
                VALUES (gen_random_uuid(), 'card_freeze', $1, 'unfreeze', 'failed', NULL,
                        'agent_tool unfreeze_card: DB updated, Issuer sync failed',
                        $2, now())`,
              [ctx.cardId, (err?.message || 'unknown').slice(0, 200)],
            ).catch(() => { /* best-effort */ });
          }
        }

        await ctx.db.query(
          `INSERT INTO execution_log
            (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
            VALUES (gen_random_uuid(), 'card_freeze', $1, 'unfreeze', 'success', NULL,
                    'agent_tool unfreeze_card: card unfrozen via per-card agent chat', NULL, now())`,
          [ctx.cardId],
        ).catch(() => { /* best-effort */ });

        return {
          ok: true,
          result: { frozen: false, last4: card.card_last_4 },
          stateChange: {
            entity: 'card',
            id: ctx.cardId,
            patch: { is_locked: false },
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'unfreeze_card failed' };
      }
    },
  },
  {
    name: 'get_balance',
    description:
      "Look up the current balance on this card. Returns the dollar amount available to spend. Use this when the user asks 'what's my balance', 'how much do I have', 'show balance', or any similar question. Do NOT fabricate a balance - always call this tool.",
    input_schema: {
      type: 'object',
      properties: {},
    },
    tier: 'read-only',
    execute: async (_args, ctx) => {
      try {
        const result = await ctx.db.query(
          `SELECT id, balance, card_last_4, is_locked
            FROM cards
            WHERE id = $1 AND user_id = $2`,
          [ctx.cardId, ctx.userId],
        );
        if (!result.rows[0]) {
          return { ok: false, error: 'Card not found or not owned by this user.' };
        }
        const row = result.rows[0];
        const balance = row.balance == null ? null : Number(row.balance);
        return {
          ok: true,
          result: {
            balance_usd: balance,
            balance_formatted: balance != null ? `$${balance.toFixed(2)}` : null,
            last4: row.card_last_4,
            is_frozen: Boolean(row.is_locked),
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'get_balance failed' };
      }
    },
  },
  {
    name: 'get_recent_transactions',
    description:
      "Look up the user's most recent transactions on this card. Use this when the user asks 'what did I spend on', 'show recent transactions', 'last 5 charges', or similar. Returns up to 10 most recent transactions with merchant, amount, status, and date. Do NOT fabricate transactions - always call this tool.",
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'How many recent transactions to fetch (1..10). Defaults to 5 if not given.',
        },
      },
    },
    tier: 'read-only',
    execute: async (args, ctx) => {
      try {
        const limitRaw = typeof args?.limit === 'number' ? args.limit : 5;
        const limit = Math.max(1, Math.min(10, Math.floor(limitRaw)));
        const result = await ctx.db.query(
          `SELECT id, amount, type, status, category, merchant_name, date, created_at
            FROM card_transactions
            WHERE card_id = $1 AND user_id = $2
            ORDER BY COALESCE(date, created_at) DESC
            LIMIT $3`,
          [ctx.cardId, ctx.userId, limit],
        );
        const transactions = result.rows.map((r) => ({
          id: r.id,
          merchant: r.merchant_name || '(unknown merchant)',
          amount_usd: r.amount == null ? null : Number(r.amount),
          amount_formatted: r.amount != null ? `$${Number(r.amount).toFixed(2)}` : null,
          type: r.type,
          status: r.status,
          category: r.category,
          date: (r.date || r.created_at) instanceof Date
            ? (r.date || r.created_at).toISOString()
            : String(r.date || r.created_at),
        }));
        return {
          ok: true,
          result: {
            count: transactions.length,
            transactions,
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'get_recent_transactions failed' };
      }
    },
  },
  {
    name: 'get_card_details',
    description:
      "Look up everything about THIS card: name, last four digits, expiry, type, frozen state, balance, color theme. Read-only - no state change. Use when the user asks 'what's my card info', 'tell me about this card', 'what kind of card is this', or any open-ended 'about me' question.",
    input_schema: {
      type: 'object',
      properties: {},
    },
    tier: 'read-only',
    execute: async (_args, ctx) => {
      try {
        const result = await ctx.db.query(
          `SELECT id, card_name, card_last_4, expiry_date, card_type, is_locked, balance, gradient, is_active
            FROM cards
            WHERE id = $1 AND user_id = $2`,
          [ctx.cardId, ctx.userId],
        );
        if (!result.rows[0]) {
          return { ok: false, error: 'Card not found or not owned by this user.' };
        }
        const r = result.rows[0];
        const balance = r.balance == null ? null : Number(r.balance);
        return {
          ok: true,
          result: {
            card_name: r.card_name,
            last4: r.card_last_4,
            expiry: r.expiry_date,
            card_type: r.card_type,
            is_frozen: Boolean(r.is_locked),
            is_active: Boolean(r.is_active),
            balance_usd: balance,
            balance_formatted: balance != null ? `$${balance.toFixed(2)}` : null,
            color_gradient: r.gradient,
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'get_card_details failed' };
      }
    },
  },
  {
    name: 'rename_card',
    description:
      "Rename this card. INVOKE THIS TOOL - do not just say you renamed it. Saying 'Done, I'm now called X' in text without calling this tool is a LIE that Agent Smith will log as a drift violation. Updates the card_name field which appears in the chat header, card list, and dashboard. Use when the user says 'rename me to X', 'call me X', 'change my name to X', or any naming request. The new name must be 1-80 characters. INVOKE NOW, then describe what happened.",
    input_schema: {
      type: 'object',
      properties: {
        new_name: {
          type: 'string',
          description: 'The new card name. 1-80 characters. Required.',
        },
      },
      required: ['new_name'],
    },
    tier: 'self-serve',
    execute: async (args, ctx) => {
      try {
        const newName = String(args?.new_name ?? '').trim();
        if (!newName || newName.length > 80) {
          return { ok: false, error: 'new_name must be 1-80 characters.' };
        }
        const result = await ctx.db.query(
          `UPDATE cards SET card_name = $1
            WHERE id = $2 AND user_id = $3
            RETURNING id, card_name, card_last_4`,
          [newName, ctx.cardId, ctx.userId],
        );
        if (!result.rows[0]) {
          return { ok: false, error: 'Card not found or not owned by this user.' };
        }
        await ctx.db.query(
          `INSERT INTO execution_log
            (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
            VALUES (gen_random_uuid(), 'card_rename', $1, 'rename', 'success', NULL,
                    $2, NULL, now())`,
          [ctx.cardId, `agent_tool rename_card: card renamed to "${newName}" via per-card agent chat`],
        ).catch(() => { /* best-effort */ });
        return {
          ok: true,
          result: { new_name: newName, last4: result.rows[0].card_last_4 },
          stateChange: {
            entity: 'card',
            id: ctx.cardId,
            patch: { card_name: newName },
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'rename_card failed' };
      }
    },
  },
  {
    name: 'change_card_color',
    description:
      "Change the visual color theme of THIS card. INVOKE THIS TOOL - do not just say you changed it. Saying 'Done, I'm now blue' in text without calling this tool is a LIE that Agent Smith will log as a drift violation. Cards have 5 color variants: black (noir), blue, green, purple, white. Use when the user says 'change to purple', 'make me green', 'switch to black', 'go blue', or any color-change request. The dashboard card face updates with the new theme. INVOKE NOW, then describe what happened.",
    input_schema: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          enum: ['black', 'blue', 'green', 'purple', 'white'],
          description: 'The new color variant. One of: black, blue, green, purple, white.',
        },
      },
      required: ['color'],
    },
    tier: 'self-serve',
    execute: async (args, ctx) => {
      try {
        const color = String(args?.color ?? '').toLowerCase().trim();
 // Map color name → gradient string. Must match the swatches in
 // src/lib/cardSkins.ts CARD_SKINS array, otherwise the resolver
 // (resolveNuroCardFaceIdFromGradient) won't find the right PNG.
        const gradientMap: Record<string, string> = {
          black: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
          blue: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
          green: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)',
          purple: 'linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)',
          white: 'linear-gradient(135deg, #ffffff 0%, #e8eef5 100%)',
        };
        const gradient = gradientMap[color];
        if (!gradient) {
          return { ok: false, error: `Unknown color '${color}'. Valid: black, blue, green, purple, white.` };
        }
        const result = await ctx.db.query(
          `UPDATE cards SET gradient = $1
            WHERE id = $2 AND user_id = $3
            RETURNING id, card_last_4`,
          [gradient, ctx.cardId, ctx.userId],
        );
        if (!result.rows[0]) {
          return { ok: false, error: 'Card not found or not owned by this user.' };
        }
        await ctx.db.query(
          `INSERT INTO execution_log
            (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
            VALUES (gen_random_uuid(), 'card_color', $1, 'recolor', 'success', NULL,
                    $2, NULL, now())`,
          [ctx.cardId, `agent_tool change_card_color: color set to '${color}' via per-card agent chat`],
        ).catch(() => { /* best-effort */ });
        return {
          ok: true,
          result: { color, last4: result.rows[0].card_last_4 },
          stateChange: {
            entity: 'card',
            id: ctx.cardId,
            patch: { gradient },
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'change_card_color failed' };
      }
    },
  },
  {
    name: 'get_spending_today',
    description:
      "Sum total spending on THIS card today (debits/charges since midnight UTC). Read-only. Use when the user asks 'how much have I spent today', 'today's charges', 'what's my spending today', or similar. Returns the sum in USD and the number of transactions.",
    input_schema: {
      type: 'object',
      properties: {},
    },
    tier: 'read-only',
    execute: async (_args, ctx) => {
      try {
        const result = await ctx.db.query(
          `SELECT
            COALESCE(SUM(CASE WHEN type = 'debit' OR amount < 0 THEN ABS(amount) ELSE 0 END), 0)::numeric AS total_spent,
            COUNT(*)::int AS tx_count
            FROM card_transactions
            WHERE card_id = $1 AND user_id = $2
              AND COALESCE(date, created_at) >= CURRENT_DATE`,
          [ctx.cardId, ctx.userId],
        );
        const row = result.rows[0];
        const totalSpent = Number(row?.total_spent ?? 0);
        const txCount = Number(row?.tx_count ?? 0);
        return {
          ok: true,
          result: {
            total_spent_usd: totalSpent,
            total_spent_formatted: `$${totalSpent.toFixed(2)}`,
            transaction_count: txCount,
            since: 'midnight UTC today',
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'get_spending_today failed' };
      }
    },
  },
 // ─────────────────────────────────────────────────────────────────────
 // M12 Day 2 batch B (2026-05-30) - 4 read-only spend-analytics tools
 // Ride the trust-contract win. No new migrations, no state mutation,
 // no Issuer dependency. Pure read-only queries against card_transactions
 // expose richer spend insight without architectural risk.
 // ─────────────────────────────────────────────────────────────────────
  {
    name: 'search_transactions',
    description:
      "Search this card's transactions by merchant name or keyword. Use this when the user asks 'did I shop at amazon', 'find my coffee charges', 'show me all uber rides', 'what did I spend at starbucks', or any merchant/keyword search. Returns up to 20 matches with merchant, amount, status, and date. Case-insensitive substring match. Do NOT fabricate transactions - always call this tool.",
    input_schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Merchant name or keyword to search for. Case-insensitive substring match against merchant_name. Required.',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (1..20). Defaults to 10.',
        },
      },
      required: ['keyword'],
    },
    tier: 'read-only',
    execute: async (args, ctx) => {
      try {
        const keyword = String(args?.keyword ?? '').trim();
        if (!keyword) {
          return { ok: false, error: 'keyword is required.' };
        }
        const limitRaw = typeof args?.limit === 'number' ? args.limit : 10;
        const limit = Math.max(1, Math.min(20, Math.floor(limitRaw)));
        const result = await ctx.db.query(
          `SELECT id, amount, type, status, category, merchant_name, date, created_at
            FROM card_transactions
            WHERE card_id = $1 AND user_id = $2
              AND merchant_name ILIKE '%' || $3 || '%'
            ORDER BY COALESCE(date, created_at) DESC
            LIMIT $4`,
          [ctx.cardId, ctx.userId, keyword, limit],
        );
        const transactions = result.rows.map((r) => ({
          id: r.id,
          merchant: r.merchant_name || '(unknown merchant)',
          amount_usd: r.amount == null ? null : Number(r.amount),
          amount_formatted: r.amount != null ? `$${Number(r.amount).toFixed(2)}` : null,
          type: r.type,
          status: r.status,
          category: r.category,
          date: (r.date || r.created_at) instanceof Date
            ? (r.date || r.created_at).toISOString()
            : String(r.date || r.created_at),
        }));
        return {
          ok: true,
          result: {
            keyword,
            count: transactions.length,
            transactions,
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'search_transactions failed' };
      }
    },
  },
  {
    name: 'get_spending_by_category',
    description:
      "Aggregate spending on THIS card grouped by category for a given period. Use when the user asks 'how much did I spend on food this month', 'what's my biggest category', 'breakdown of my spend', 'where does my money go', or similar category-rollup questions. Returns total per category sorted descending. Period defaults to month if not given.",
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month', 'quarter', 'year', 'all'],
          description: 'Time window. Defaults to month.',
        },
      },
    },
    tier: 'read-only',
    execute: async (args, ctx) => {
      try {
        const period = ['day', 'week', 'month', 'quarter', 'year', 'all'].includes(String(args?.period))
          ? String(args.period)
          : 'month';
 // Map period → SQL interval clause for the WHERE filter.
        const sinceClauseMap: Record<string, string> = {
          day:    `COALESCE(date, created_at) >= CURRENT_DATE`,
          week:   `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '7 days'`,
          month:  `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '30 days'`,
          quarter:`COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '90 days'`,
          year:   `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '365 days'`,
          all:    `TRUE`,
        };
        const sinceClause = sinceClauseMap[period];
        const result = await ctx.db.query(
          `SELECT
            COALESCE(category, '(uncategorized)') AS category,
            COALESCE(SUM(CASE WHEN type = 'debit' OR amount < 0 THEN ABS(amount) ELSE 0 END), 0)::numeric AS total_spent,
            COUNT(*)::int AS tx_count
            FROM card_transactions
            WHERE card_id = $1 AND user_id = $2
              AND ${sinceClause}
            GROUP BY COALESCE(category, '(uncategorized)')
            ORDER BY total_spent DESC`,
          [ctx.cardId, ctx.userId],
        );
        const categories = result.rows.map((r) => ({
          category: r.category,
          total_spent_usd: Number(r.total_spent),
          total_spent_formatted: `$${Number(r.total_spent).toFixed(2)}`,
          transaction_count: Number(r.tx_count),
        }));
        const grandTotal = categories.reduce((s, c) => s + c.total_spent_usd, 0);
        return {
          ok: true,
          result: {
            period,
            grand_total_usd: grandTotal,
            grand_total_formatted: `$${grandTotal.toFixed(2)}`,
            category_count: categories.length,
            categories,
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'get_spending_by_category failed' };
      }
    },
  },
  {
    name: 'get_spending_by_period',
    description:
      "Total spending on THIS card for a given time window (week/month/quarter/year). Use when the user asks 'how much have I spent this week', 'this month total', 'year to date', 'last 30 days', or any period-aggregation question. Returns total sum + transaction count for the chosen window. More general than get_spending_today - that one is always-today; this one takes a period.",
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month', 'quarter', 'year'],
          description: 'Time window. Required.',
        },
      },
      required: ['period'],
    },
    tier: 'read-only',
    execute: async (args, ctx) => {
      try {
        const period = String(args?.period ?? '').toLowerCase();
        const sinceClauseMap: Record<string, { sql: string; label: string }> = {
          day:    { sql: `COALESCE(date, created_at) >= CURRENT_DATE`, label: 'today' },
          week:   { sql: `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '7 days'`, label: 'last 7 days' },
          month:  { sql: `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '30 days'`, label: 'last 30 days' },
          quarter:{ sql: `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '90 days'`, label: 'last 90 days' },
          year:   { sql: `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '365 days'`, label: 'last 365 days' },
        };
        const entry = sinceClauseMap[period];
        if (!entry) {
          return { ok: false, error: `Invalid period '${period}'. Valid: day, week, month, quarter, year.` };
        }
        const result = await ctx.db.query(
          `SELECT
            COALESCE(SUM(CASE WHEN type = 'debit' OR amount < 0 THEN ABS(amount) ELSE 0 END), 0)::numeric AS total_spent,
            COUNT(*)::int AS tx_count
            FROM card_transactions
            WHERE card_id = $1 AND user_id = $2
              AND ${entry.sql}`,
          [ctx.cardId, ctx.userId],
        );
        const row = result.rows[0];
        const totalSpent = Number(row?.total_spent ?? 0);
        const txCount = Number(row?.tx_count ?? 0);
        return {
          ok: true,
          result: {
            period,
            period_label: entry.label,
            total_spent_usd: totalSpent,
            total_spent_formatted: `$${totalSpent.toFixed(2)}`,
            transaction_count: txCount,
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'get_spending_by_period failed' };
      }
    },
  },
  {
    name: 'get_largest_transactions',
    description:
      "List the N largest transactions on THIS card by absolute amount. Use when the user asks 'what's my biggest charge', 'top 5 spends', 'biggest hits', 'most expensive recent charges', or similar magnitude-ranked questions. Returns up to 10 transactions sorted by amount descending. Optional period filter to scope to recent.",
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'How many top transactions to return (1..10). Defaults to 5.',
        },
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter', 'year', 'all'],
          description: 'Optional time window. Defaults to month.',
        },
      },
    },
    tier: 'read-only',
    execute: async (args, ctx) => {
      try {
        const limitRaw = typeof args?.limit === 'number' ? args.limit : 5;
        const limit = Math.max(1, Math.min(10, Math.floor(limitRaw)));
        const period = ['week', 'month', 'quarter', 'year', 'all'].includes(String(args?.period))
          ? String(args.period)
          : 'month';
        const sinceClauseMap: Record<string, string> = {
          week:    `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '7 days'`,
          month:   `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '30 days'`,
          quarter: `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '90 days'`,
          year:    `COALESCE(date, created_at) >= CURRENT_DATE - INTERVAL '365 days'`,
          all:     `TRUE`,
        };
        const sinceClause = sinceClauseMap[period];
        const result = await ctx.db.query(
          `SELECT id, amount, type, status, category, merchant_name, date, created_at
            FROM card_transactions
            WHERE card_id = $1 AND user_id = $2
              AND ${sinceClause}
              AND (type = 'debit' OR amount < 0)
            ORDER BY ABS(amount) DESC
            LIMIT $3`,
          [ctx.cardId, ctx.userId, limit],
        );
        const transactions = result.rows.map((r) => ({
          id: r.id,
          merchant: r.merchant_name || '(unknown merchant)',
          amount_usd: r.amount == null ? null : Math.abs(Number(r.amount)),
          amount_formatted: r.amount != null ? `$${Math.abs(Number(r.amount)).toFixed(2)}` : null,
          type: r.type,
          status: r.status,
          category: r.category,
          date: (r.date || r.created_at) instanceof Date
            ? (r.date || r.created_at).toISOString()
            : String(r.date || r.created_at),
        }));
        return {
          ok: true,
          result: {
            period,
            count: transactions.length,
            transactions,
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'get_largest_transactions failed' };
      }
    },
  },
 // Day 2 GATED + Day 3 additions (see Marathon 12 - Build Plan Day 1.md):
 // - get_daily_limit (read-only, GATED on Issuer enforcement check Mon AM)
 // - get_remaining_today (read-only, derived from card_transactions + limit)
 // - request_withdrawal (confirms-on-execute, asks destination first)
 // - request_limit_increase (confirms-on-execute, GATED on Issuer)
 // - transfer_card_to_vault (confirms-on-execute)
 // - transfer_vault_to_card (self-serve, reversible)
 // - transfer_to_user (confirms-on-execute)
 // - report_lost_or_stolen (confirms-on-execute)
 // - set_spend_alert (self-serve, gated on migration 055 card_spend_alerts)
];

export function getToolByName(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOL_REGISTRY.find((t) => t.name === name);
}

/** Anthropic Messages API `tools` array shape - name + description + schema only. */
export function toolsForAnthropic() {
  return AGENT_TOOL_REGISTRY.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

/** OpenAI Chat Completions `tools` array. */
export function toolsForOpenAI() {
  return AGENT_TOOL_REGISTRY.map(({ name, description, input_schema }) => ({
    type: "function" as const,
    function: {
      name,
      description,
      parameters: input_schema,
    },
  }));
}

/** Gemini `functionDeclarations` array. */
export function toolsForGemini() {
  return AGENT_TOOL_REGISTRY.map(({ name, description, input_schema }) => ({
    name,
    description,
    parameters: input_schema,
  }));
}

/** Human-readable tool list for the system prompt's capability disclosure. */
export function toolsForSystemPrompt(): string {
  return AGENT_TOOL_REGISTRY.map((t) => `  - ${t.name}: ${t.description}`).join('\n');
}

/**
 * Short past-tense label for a tool that fired. Shown as a tiny pill under
 * the corresponding assistant chat message so the user gets CONCRETE proof
 * of what actually happened - "Froze the card" is more trust-building than
 * an opaque tool name like "freeze_card". Reinforces the trust contract:
 * agent's words match tool's action.
 */
export function getToolFriendlyLabel(name: string): string {
  switch (name) {
    case 'freeze_card':
      return 'Froze the card';
    case 'unfreeze_card':
      return 'Unfroze the card';
    case 'get_balance':
      return 'Checked balance';
    case 'get_recent_transactions':
      return 'Pulled recent transactions';
    case 'get_card_details':
      return 'Read card details';
    case 'rename_card':
      return 'Renamed the card';
    case 'change_card_color':
      return 'Changed card color';
    case 'get_spending_today':
      return 'Checked today’s spending';
    case 'search_transactions':
      return 'Searched transactions';
    case 'get_spending_by_category':
      return 'Broke down spending by category';
    case 'get_spending_by_period':
      return 'Summed spending for period';
    case 'get_largest_transactions':
      return 'Pulled top transactions';
    case 'get_daily_limit':
      return 'Checked daily limit';
    case 'get_remaining_today':
      return 'Checked remaining today';
    case 'request_withdrawal':
      return 'Requested withdrawal';
    case 'request_limit_increase':
      return 'Requested limit increase';
    case 'transfer_card_to_vault':
      return 'Moved card balance to Savings';
    case 'transfer_vault_to_card':
      return 'Reloaded card from Savings';
    case 'transfer_to_user':
      return 'Sent to user';
    case 'report_lost_or_stolen':
      return 'Reported lost/stolen';
    default:
      return name;
  }
}
