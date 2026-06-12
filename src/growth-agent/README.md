# AFI Growth Agent — Autonomous Social Presence

> Sub-agent of Mythos Neural Net. Manages AFI's brand presence across social platforms.
> Thinks for itself. Posts daily. Follows trends. Drives sign-ups.

## Architecture

```
Mythos (Parent Neural Net)
    │
    └── Growth Agent (Sub-Agent)
         ├── Feed Ingestion (reads market-feeds.ts cache)
         ├── Content Brain (generates posts from data)
         ├── Platform Skills (posts to each platform)
         ├── Daily Log (autonomous journal)
         └── Analytics (tracks engagement → sign-ups)

Data Flow:
  market_feed_cache (CoinGecko, Sports, Polymarket)
       │
       ▼
  Growth Agent Content Brain
  ├── Trending Crypto → "BTC just broke $X — bet on it at app.nuro.finance"
  ├── Sports Upcoming → "Lakers vs Warriors tonight — predict the winner"
  ├── Polymarket Hot → "Iran ceasefire market at 95% YES — what do you think?"
  ├── Market Resolved → "Oracle just resolved: BTC DID hit $72K! Winners paid out"
  └── Agent Performance → "Alpha Bot earned $X this week — deploy yours"
       │
       ▼
  Platform Adapters
  ├── Moltbook (PRIMARY) — @AFI or @NuroFinance
  ├── X/Twitter — @NuroFinance
  ├── Telegram — @AFI_Bot
  ├── TikTok — @nuro.finance
  └── YouTube — Nuro Finance channel
```

## Platform Priority

1. **Moltbook** — Our own network. POST FIRST here. Build community.
2. **Telegram** — Bot commands for market alerts + betting
3. **X/Twitter** — Crypto community engagement
4. **TikTok** — Short-form video market predictions
5. **YouTube** — Weekly digest, tutorials

## Skills

| Skill | File | Purpose |
|-------|------|---------|
| `moltbook` | `skills/moltbook.ts` | Post, reply, engage on Moltbook |
| `twitter` | `skills/twitter.ts` | Post, reply, thread on X |
| `telegram` | `skills/telegram.ts` | Send alerts, handle commands |
| `tiktok` | `skills/tiktok.ts` | Upload short-form video |
| `youtube` | `skills/youtube.ts` | Upload videos, manage channel |
| `content` | `skills/content.ts` | Generate post content from feed data |
| `avatar` | `skills/avatar.ts` | AI video avatar for TikTok/YouTube |
| `daily-log` | `skills/daily-log.ts` | Autonomous daily journal + planning |

## CRUD Functions (Autonomous Daily Loop)

```
Every day at 9 AM:
  1. READ  — Fetch latest from market_feed_cache (crypto prices, sports, trending)
  2. READ  — Check execution_log for resolved markets, big wins, system events
  3. THINK — Generate 5-10 content ideas ranked by engagement potential
  4. CREATE — Write posts for each platform (tailored format/tone)
  5. POST  — Push to Moltbook first, then cascade to other platforms
  6. LOG   — Record what was posted, engagement metrics, sign-up attribution
  7. LEARN — Analyze which posts drove the most engagement → adjust strategy

Every hour:
  1. CHECK — Any new market resolutions? Big price moves? Breaking news?
  2. POST  — Real-time alerts for significant events
  3. ENGAGE — Reply to comments/mentions on active platforms
```

## Video Avatar

For TikTok and YouTube, use an AI avatar creator:
- **HeyGen** (heygen.com) — API for AI avatar videos, text-to-speech, custom avatars
- **Synthesia** (synthesia.io) — Enterprise AI video, 140+ languages
- **D-ID** (d-id.com) — Real-time AI avatar, streaming API
- **Tavus** (tavus.io) — Personalized video at scale

Recommended: **HeyGen** — best API, affordable, supports custom avatar creation.
Create an AFI brand avatar once → reuse for all video content.

## Environment Variables Needed

```env
# Moltbook
MOLTBOOK_API_KEY=           # From Chris — Moltbook app key
MOLTBOOK_AGENT_TOKEN=       # Agent's Moltbook auth token

# X/Twitter
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=

# Telegram
TELEGRAM_BOT_TOKEN=         # Already have: from Accounts & Test Users

# TikTok
TIKTOK_ACCESS_TOKEN=

# YouTube
YOUTUBE_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# Video Avatar
HEYGEN_API_KEY=

# AFI
AFI_APP_URL=https://app.nuro.finance
ADMIN_USER_ID=db01a59c-a418-4da0-a4aa-fb032d500b04
```
