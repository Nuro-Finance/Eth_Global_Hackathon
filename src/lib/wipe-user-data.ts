/** Dev account deletion: remove user rows from local Nuro DB (shared by API + wipe script). */

export type WipeDbClient = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rowCount: number | null; rows?: unknown[] }>;
};

type WipeStep = {
  label: string;
  sql: string;
  params: (userId: string, email: string) => unknown[];
};

const WIPE_STEPS: WipeStep[] = [
  {
    label: "hl_vault_positions",
    sql: "DELETE FROM hl_vault_positions WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "card_agent_messages",
    sql: "DELETE FROM card_agent_messages WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "card_transactions",
    sql: "DELETE FROM card_transactions WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "card_settlements",
    sql: "DELETE FROM card_settlements WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "agent_bets",
    sql: "DELETE FROM agent_bets WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "agent_fundings",
    sql: "DELETE FROM agent_fundings WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "agent_profit_sweeps",
    sql: "DELETE FROM agent_profit_sweeps WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "agents",
    sql: "DELETE FROM agents WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "cards",
    sql: "DELETE FROM cards WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "ens_claims",
    sql: "DELETE FROM ens_claims WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "user_signals",
    sql: "DELETE FROM user_signals WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "self_learn_reports",
    sql: "DELETE FROM self_learn_reports WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "notification_reads",
    sql: "DELETE FROM notification_reads WHERE user_id::text = $1",
    params: (userId) => [userId],
  },
  {
    label: "address_book",
    sql: "DELETE FROM address_book WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "plaid_accounts",
    sql: "DELETE FROM plaid_accounts WHERE user_id::text = $1",
    params: (userId) => [userId],
  },
  {
    label: "nuro_mcp_write_confirmations",
    sql: "DELETE FROM nuro_mcp_write_confirmations WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "nuro_mcp_keys",
    sql: "DELETE FROM nuro_mcp_keys WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "transfers",
    sql: "DELETE FROM transfers WHERE sender_user_id = $1 OR recipient_user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "transactions",
    sql: "DELETE FROM transactions WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "execution_log",
    sql: "DELETE FROM execution_log WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "deposit_addresses",
    sql: "DELETE FROM deposit_addresses WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "agent_violations",
    sql: "DELETE FROM agent_violations WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "notifications",
    sql: "DELETE FROM notifications WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "withdrawals",
    sql: "DELETE FROM withdrawals WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "market_positions",
    sql: "DELETE FROM market_positions WHERE user_id = $1",
    params: (userId) => [userId],
  },
  {
    label: "email_otps",
    sql: "DELETE FROM email_otps WHERE lower(email) = lower($1)",
    params: (_userId, email) => [email],
  },
];

async function runWipeStep(
  client: WipeDbClient,
  step: WipeStep,
  userId: string,
  email: string,
): Promise<number> {
  try {
    const result = await client.query(step.sql, step.params(userId, email));
    return result.rowCount ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("does not exist")) return 0;
    throw err;
  }
}

export async function wipeUserData(
  client: WipeDbClient,
  userId: string,
  email: string,
): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const step of WIPE_STEPS) {
      await runWipeStep(client, step, userId, email);
    }
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export const DEMO_WIPE_EMAIL = "demo@nuro.finance";
