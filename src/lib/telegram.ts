import axios from 'axios'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: string = 'HTML',
): Promise<boolean> {
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
