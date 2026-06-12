/**
 * Minimal transactional-email helper.
 *
 * Day-5 (Marathon 11): we ship the wiring but the actual send is gated on
 * the presence of `RESEND_API_KEY`. Without the key, every send becomes a
 * structured log line — the surrounding flow (alert insert, audit log,
 * notification fan-out) keeps working and only the literal SMTP delivery
 * is skipped. To activate:
 *
 *   1. Sign up at resend.com (free tier covers 3K emails / month).
 *   2. Verify a sender domain (or use the resend.dev sandbox for demo).
 *   3. Add `RESEND_API_KEY=re_...` and `EMAIL_FROM=alerts@<your-domain>`
 *      to the VPS env. PM2 reload picks them up on next restart.
 *
 * No new deps — uses axios which is already a transitive dep.
 */

import axios from 'axios'

const RESEND_API_URL = 'https://api.resend.com/emails'

interface SendEmailInput {
  to: string
  subject: string
  /** Plaintext body. HTML version derived by replacing newlines with <br>. */
  text: string
}

interface SendEmailResult {
  ok: boolean
  /** Provider message id when ok; error string when not. */
  detail: string
}

export async function sendEmail({ to, subject, text }: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'alerts@nuro.finance'

  if (!key) {
    console.log(`[email] RESEND_API_KEY not set — skipping send to=${to.slice(0, 60)} subject="${subject}"`)
    return { ok: false, detail: 'no_api_key' }
  }
  if (!to || !to.includes('@')) {
    return { ok: false, detail: 'invalid_recipient' }
  }

  try {
    const html = text.replace(/\n/g, '<br>')
    const res = await axios.post(
      RESEND_API_URL,
      { from, to, subject, text, html },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      },
    )
    const id = String(res.data?.id ?? 'unknown')
    return { ok: true, detail: id }
  } catch (err: any) {
    const detail =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'send_failed'
    console.warn(`[email] send failed to=${to.slice(0, 60)}: ${detail}`)
    return { ok: false, detail: String(detail).slice(0, 200) }
  }
}

/**
 * Domain-specific helper — formats the "high-value transaction" body and
 * pulls the user's email at the call site. Returns ok/no-key so the
 * caller can audit-log appropriately.
 */
export interface ThresholdAlertContext {
  email: string
  cardLast4: string | null
  amount: number
  threshold: number
  merchant: string
  category: string
  occurredAt: Date
}

export async function sendThresholdAlertEmail(ctx: ThresholdAlertContext): Promise<SendEmailResult> {
  const { email, cardLast4, amount, threshold, merchant, category, occurredAt } = ctx
  const last4 = cardLast4 ? `•••• ${cardLast4}` : 'your card'
  const subject = `Nuro: $${amount.toFixed(2)} charge on ${last4}`
  const ts = occurredAt.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  const text = [
    `Hi,`,
    ``,
    `A transaction on ${last4} crossed your spend-threshold alert.`,
    ``,
    `  Amount:    $${amount.toFixed(2)}`,
    `  Merchant:  ${merchant}`,
    `  Category:  ${category}`,
    `  When:      ${ts}`,
    ``,
    `Your alert threshold is set to $${threshold.toFixed(2)}. If this`,
    `transaction looks unfamiliar, freeze the card from the Nuro`,
    `dashboard or report it as lost/stolen — both actions sync to your`,
    `issuer immediately.`,
    ``,
    `If this was you, no action is needed. You can update your alert`,
    `threshold under Card Settings → Notifications → Spend Threshold.`,
    ``,
    `— Nuro Card Alerts`,
  ].join('\n')

  return sendEmail({ to: email, subject, text })
}
