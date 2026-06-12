/**
 * Nuro MCP tool definitions + dispatchers.
 *
 * The 6 tools an external AI client can call against a user's Nuro account.
 * Read tools fire immediately. Write tools return a confirmation_code that
 * the user's AI must surface back to them; the user explicitly confirms,
 * AI calls the tool again with the code, server then executes.
 *
 * Tool schemas follow the MCP spec (https://modelcontextprotocol.io/docs/concepts/tools).
 *
 * All tool dispatches scope strictly to the authenticated user_id — passed
 * in from the route handler after `resolveMcpKey()` succeeded.
 */

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

// ─── Tool schemas (MCP wire format) ─────────────────────────────────────────

export const MCP_TOOLS = [
  {
    name: "get_balance",
    description:
      "Returns the total balance across all of the user's Nuro cards, plus a per-card breakdown.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_cards",
    description:
      "Lists all of the user's Nuro cards with names, types, balances, and active/locked status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_recent_transactions",
    description:
      "Returns the user's recent transactions across all cards (default 20). Optionally filter by card or since-date.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max transactions to return (1-100, default 20)",
          minimum: 1,
          maximum: 100,
        },
        card_id: {
          type: "string",
          description: "Optional: filter to a specific card's transactions only",
        },
        since: {
          type: "string",
          description: "Optional: ISO-8601 date; only return transactions on or after this date",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_spending_summary",
    description:
      "Returns aggregate spending over a window (7d / 30d / 90d), grouped by category or merchant. Useful for 'what did I spend on X this month' queries.",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: ["7d", "30d", "90d"],
          description: "Time window for aggregation",
        },
        group_by: {
          type: "string",
          enum: ["category", "merchant"],
          description: "How to group the spending",
        },
      },
      required: ["window", "group_by"],
      additionalProperties: false,
    },
  },
  {
    name: "set_card_limit",
    description:
      "Set a daily or monthly spend limit on a card. This is a destructive action — first call returns a confirmation_code; user must say 'confirm with code XXXXXX' and AI calls again with that code to actually apply.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "string", description: "The card's UUID" },
        limit_type: { type: "string", enum: ["daily", "monthly"] },
        new_limit_usd: { type: "number", minimum: 0, description: "New limit in whole USD" },
        confirmation_code: {
          type: "string",
          description:
            "On second call, the 6-digit code returned by the first call. Omit on first call.",
        },
      },
      required: ["card_id", "limit_type", "new_limit_usd"],
      additionalProperties: false,
    },
  },
  {
    name: "freeze_card",
    description:
      "Freeze a card (no further spend until unfrozen). Confirmation-token gated, same pattern as set_card_limit.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "string", description: "The card's UUID" },
        confirmation_code: {
          type: "string",
          description: "On second call, the 6-digit code returned by the first call.",
        },
      },
      required: ["card_id"],
      additionalProperties: false,
    },
  },
];

// ─── Tool dispatch ──────────────────────────────────────────────────────────

interface DispatchContext {
  user_id: string;
  key_id: string;
  scopes: string[];
}

export async function dispatchMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: DispatchContext
): Promise<{ ok: boolean; content?: unknown; error?: string }> {
 // Backend handles all the actual queries via a single dispatch endpoint.
 // Frontend Next.js process just acts as MCP-protocol glue + auth layer.
  try {
    const r = await fetch(`${BACKEND_URL}/mcp/tools/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool_name: toolName,
        args,
        user_id: ctx.user_id,
        key_id: ctx.key_id,
        scopes: ctx.scopes,
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { ok: false, error: `backend error ${r.status}: ${text.slice(0, 200)}` };
    }
    const data = await r.json();
    if (!data?.ok) {
      return { ok: false, error: data?.error ?? "unknown error" };
    }
    return { ok: true, content: data.content };
  } catch (err) {
    return { ok: false, error: `network error: ${String(err)}` };
  }
}
