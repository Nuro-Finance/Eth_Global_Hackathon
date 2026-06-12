/**
 * ─── TELEGRAM PLATFORM SKILL ─────────────────────────────────────────────────
 *
 * AFI Telegram bot for market alerts + community engagement.
 * Uses existing bot token from Accounts & Test Users.
 *
 * Commands:
 *   /markets  — Show top active markets
 *   /prices   — Show crypto prices
 *   /sports   — Upcoming sports events
 *   /bet      — Quick bet link
 *   /alerts   — Subscribe to price alerts
 */

import axios from 'axios'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

export async function sendTelegramMessage(chatId: string, text: string, parseMode: string = 'HTML'): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.log('[telegram] No bot token — message queued')
    return false
  }
  try {
    await axios.post(`${TG_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: false,
    })
    return true
  } catch (err: any) {
    console.error('[telegram] Send failed:', err.response?.data?.description || err.message)
    return false
  }
}

export async function broadcastToChannel(channelId: string, text: string): Promise<boolean> {
  return sendTelegramMessage(channelId, text)
}

export async function sendMarketAlert(chatId: string, marketQuestion: string, yesPrice: number, link: string): Promise<boolean> {
  const text = `🔮 <b>Hot Market</b>\n\n${marketQuestion}\n\n` +
    `YES: ${yesPrice}% | NO: ${100 - yesPrice}%\n\n` +
    `<a href="${link}">Bet Now →</a>`
  return sendTelegramMessage(chatId, text)
}

export async function sendPriceAlert(chatId: string, coin: string, price: number, change: number): Promise<boolean> {
  const emoji = change > 0 ? '📈' : '📉'
  const text = `${emoji} <b>${coin}</b> ${change > 0 ? '+' : ''}${change.toFixed(1)}%\n` +
    `Price: $${price.toLocaleString()}\n\n` +
    `<a href="https://app.nuro.finance/en/dashboard/markets">Bet on it →</a>`
  return sendTelegramMessage(chatId, text)
}
