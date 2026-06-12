/**
 * ─── VENTURE PORTAL ──────────────────────────────────────────────────────────
 *
 * Investor-facing portal at /invest
 * Password-gated. Matches Nuro brand design (dark, clean, trust-first).
 *
 * POSITIONING: Agentic Banking — NOT prediction markets.
 * Nuro is a crypto-native AI Agent Neo Bank with instant Visa card.
 * The bank of the future, powered by neural net intelligence.
 */

import { Router, Request, Response } from 'express'

const INVEST_PASSWORD = process.env.INVEST_PASSWORD || 'nuro2026'

export function createVenturePortalRouter(): Router {
  const router = Router()

  router.get('/invest', (req: Request, res: Response) => {
    const pw = req.query.pw || req.query.password
    if (pw !== INVEST_PASSWORD) {
      res.setHeader('Content-Type', 'text/html')
      return res.send(gateHTML())
    }
    res.setHeader('Content-Type', 'text/html')
    res.send(portalHTML())
  })

  router.post('/invest/verify', (req: Request, res: Response) => {
    const { password } = req.body || {}
    if (password === INVEST_PASSWORD) {
      res.json({ success: true, redirect: `/invest?pw=${INVEST_PASSWORD}` })
    } else {
      res.json({ success: false, error: 'Invalid access code' })
    }
  })

  return router
}

function gateHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nuro Finance — Investor Access</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #080b14; color: #e0e0e0; font-family: -apple-system, 'SF Pro Display', 'Inter', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .gate { text-align: center; max-width: 400px; padding: 40px; }
  .logo { font-size: 36px; font-weight: 800; color: #fff; margin-bottom: 4px; letter-spacing: -1px; }
  .logo span { color: #16e0a9; }
  .gate p { font-size: 14px; color: #6b7280; margin-bottom: 32px; }
  .gate input { width: 100%; height: 52px; background: #0f1420; border: 1px solid #1e2535; border-radius: 14px; padding: 0 20px; color: #e0e0e0; font-size: 16px; text-align: center; letter-spacing: 4px; outline: none; transition: border 0.2s; }
  .gate input:focus { border-color: #16e0a9; }
  .gate button { width: 100%; height: 52px; background: linear-gradient(135deg, #16e0a9 0%, #0ea5e9 100%); color: #080b14; border: none; border-radius: 14px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 16px; transition: opacity 0.2s; }
  .gate button:hover { opacity: 0.9; }
  .error { color: #ef4444; font-size: 12px; margin-top: 8px; display: none; }
  .tag { font-size: 11px; color: #6b7280; margin-top: 24px; }
</style>
</head>
<body>
<div class="gate">
  <div class="logo"><span>nuro</span></div>
  <p>Investor Portal</p>
  <input type="password" id="pw" placeholder="Access Code" autocomplete="off" />
  <button onclick="verify()">Enter</button>
  <div class="error" id="err">Invalid access code</div>
  <div class="tag">Confidential — For qualified investors only</div>
</div>
<script>
function verify() {
  const pw = document.getElementById('pw').value;
  fetch('/invest/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    .then(r => r.json()).then(d => {
      if (d.success) window.location.href = d.redirect;
      else document.getElementById('err').style.display = 'block';
    });
}
document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });
</script>
</body>
</html>`
}

function portalHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nuro — AI Agent Banking | Investor Portal</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #080b14; color: #e0e0e0; font-family: -apple-system, 'SF Pro Display', 'Inter', sans-serif; line-height: 1.6; }
  a { color: #16e0a9; text-decoration: none; }

  /* Hero */
  .hero { min-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 80px 24px; position: relative; overflow: hidden; }
  .hero::before { content: ''; position: absolute; top: -200px; left: 50%; transform: translateX(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(22,224,169,0.06) 0%, transparent 70%); pointer-events: none; }
  .hero .tag { display: inline-block; padding: 6px 16px; background: rgba(22,224,169,0.08); border: 1px solid rgba(22,224,169,0.2); color: #16e0a9; font-size: 12px; font-weight: 600; border-radius: 24px; margin-bottom: 24px; letter-spacing: 1px; text-transform: uppercase; }
  .hero h1 { font-size: 64px; font-weight: 800; color: #fff; line-height: 1.1; margin-bottom: 20px; letter-spacing: -2px; }
  .hero h1 em { font-style: normal; color: #16e0a9; }
  .hero .sub { font-size: 20px; color: #6b7280; max-width: 640px; margin-bottom: 40px; line-height: 1.6; }
  .hero .metrics { display: flex; gap: 48px; margin-bottom: 48px; }
  .hero .metric { text-align: center; }
  .hero .metric .val { font-size: 36px; font-weight: 800; color: #fff; }
  .hero .metric .lbl { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
  .hero .cta { display: flex; gap: 16px; }
  .hero .cta a { padding: 16px 36px; border-radius: 14px; font-size: 15px; font-weight: 700; transition: all 0.2s; }
  .primary { background: linear-gradient(135deg, #16e0a9, #0ea5e9); color: #080b14; }
  .primary:hover { opacity: 0.9; transform: translateY(-2px); }
  .secondary { border: 1px solid #1e2535; color: #e0e0e0; }
  .secondary:hover { border-color: #16e0a9; }

  /* Sections */
  .section { max-width: 1080px; margin: 0 auto; padding: 100px 24px; }
  .section h2 { font-size: 42px; font-weight: 800; color: #fff; margin-bottom: 8px; letter-spacing: -1px; }
  .section h2 em { font-style: normal; color: #16e0a9; }
  .section .sub { font-size: 16px; color: #6b7280; margin-bottom: 48px; max-width: 600px; }
  .divider { height: 1px; background: linear-gradient(90deg, transparent, #1e2535, transparent); max-width: 800px; margin: 0 auto; }

  /* Cards */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
  .grid4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; }
  .card { background: #0f1420; border: 1px solid #1e2535; border-radius: 16px; padding: 32px; transition: border-color 0.2s; }
  .card:hover { border-color: #16e0a9; }
  .card h3 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .card p { font-size: 13px; color: #6b7280; line-height: 1.6; }
  .card .icon { font-size: 28px; margin-bottom: 12px; }
  .card .num { font-size: 40px; font-weight: 800; color: #16e0a9; margin-bottom: 4px; }

  /* Problem */
  .problem-stat { font-size: 56px; font-weight: 800; color: #fff; margin-bottom: 16px; line-height: 1.1; }
  .problem-stat em { font-style: normal; color: #ef4444; }

  /* Architecture */
  .arch { background: #0f1420; border: 1px solid #1e2535; border-radius: 16px; padding: 40px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; color: #16e0a9; white-space: pre-line; line-height: 2; }

  /* Team */
  .team-card { text-align: center; padding: 40px 24px; }
  .team-card img { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 16px; border: 2px solid #16e0a9; }
  .team-card .name { font-size: 20px; font-weight: 700; color: #fff; }
  .team-card .role { font-size: 13px; color: #16e0a9; font-weight: 600; margin-bottom: 12px; }

  /* Ask */
  .ask { background: linear-gradient(135deg, #0f1420 0%, #111827 100%); border: 1px solid #16e0a9; border-radius: 24px; padding: 60px; text-align: center; }
  .ask .round { font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
  .ask .amount { font-size: 64px; font-weight: 800; color: #16e0a9; letter-spacing: -2px; }
  .ask .type { font-size: 16px; color: #6b7280; margin-bottom: 32px; }
  .use-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left; max-width: 600px; margin: 0 auto; }
  .use-item { background: #0f1420; border-radius: 12px; padding: 16px; }
  .use-item .pct { font-size: 24px; font-weight: 800; color: #16e0a9; }
  .use-item .desc { font-size: 13px; color: #6b7280; margin-top: 4px; }

  .footer { text-align: center; padding: 48px; color: #374151; font-size: 12px; }

  @media (max-width: 768px) { .grid2, .grid3, .grid4 { grid-template-columns: 1fr; } .hero h1 { font-size: 36px; } .problem-stat { font-size: 36px; } .ask .amount { font-size: 42px; } }
</style>
</head>
<body>

<!-- ═══ HERO ═══ -->
<div class="hero">
  <span class="tag">Live Product — Seed / Pre-Seed</span>
  <h1>AI Agent Banking.<br/><em>Instant Visa Card.</em></h1>
  <p class="sub">The crypto-native AI Agent Banking platform & Stable Coin Railway. Spend crypto anywhere Visa is accepted. Let agents manage your money intelligently.</p>
  <div class="metrics">
    <div class="metric"><div class="val">23</div><div class="lbl">Chains</div></div>
    <div class="metric"><div class="val">$2M+</div><div class="lbl">Processed</div></div>
    <div class="metric"><div class="val">&lt;15%</div><div class="lbl">Drop-off Rate</div></div>
    <div class="metric"><div class="val">900+</div><div class="lbl">Beta Users</div></div>
  </div>
  <div class="cta">
    <a href="https://app.nuro.finance" target="_blank" class="primary">View Live App →</a>
    <a href="https://drive.google.com/file/d/1ZuLNW8qKIk_WyZhYnXGRFP0fRpE_hktP/view" target="_blank" class="secondary">Full Pitch Deck (PDF)</a>
  </div>
</div>

<div class="divider"></div>

<!-- ═══ THE PROBLEM ═══ -->
<div class="section">
  <div class="grid2">
    <div>
      <div class="problem-stat">$2 Trillion+<br/><em>sits idle.</em></div>
      <p style="color:#6b7280; font-size:15px; line-height:1.8;">Crypto holders want liquidity, but converting to cash is a broken experience. Wealth is trapped on-chain because existing off-ramps are limiting the user. Bridge, swap, gas fees, confirmation times — by the time the transaction settles, the impulse to buy is gone.</p>
    </div>
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div class="card">
        <h3>Trusted UX Gap</h3>
        <p>Spending feels risky. One wrong address and funds are gone forever. The interface assumes you're a developer.</p>
      </div>
      <div class="card">
        <h3>Complex Friction</h3>
        <p>Bridge, swap, gas fees, confirmation times. By the time the transaction settles, the impulse to buy is gone.</p>
      </div>
      <div class="card">
        <h3>Compliance &gt; Conversion</h3>
        <p>Current platforms optimize for banking partners, not users. Onboarding is an interrogation killing activation (38% drop-off).</p>
      </div>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- ═══ THE SOLUTION ═══ -->
<div class="section">
  <span class="tag" style="display:inline-block; margin-bottom:16px;">The Solution</span>
  <h2>Meet <em>Nuro.</em></h2>
  <p class="sub">AI Agent Neo Bank. Spend Crypto Anywhere Visa is Accepted. We replaced the complexity of onboarding into banking. Nuro has the familiarity of a web3 app with real spending power, instantly available to your agents.</p>
  <div class="grid3">
    <div class="card">
      <div class="icon">⚡</div>
      <h3>Instant Card Creation</h3>
      <p>Go from wallet connection to spending in seconds. Users get an instantly active virtual Visa card for online purchases immediately.</p>
    </div>
    <div class="card">
      <div class="icon">🧠</div>
      <h3>Neural Net Intelligence</h3>
      <p>Proprietary AI that manages your financial strategies autonomously. Self-learning, perpetual, growing in intelligence with every transaction.</p>
    </div>
    <div class="card">
      <div class="icon">🤖</div>
      <h3>Agentic Banking</h3>
      <p>Agent-to-agent, agent-to-user, user-to-agent transactions. Deploy AI agents that execute your personal financial neural net intelligence.</p>
    </div>
    <div class="card">
      <div class="icon">🌐</div>
      <h3>23-Chain Railway</h3>
      <p>Deposit from Ethereum, Solana, Base, Arbitrum, Polygon, and 18 more chains. All settle to Visa via our stable coin railway.</p>
    </div>
    <div class="card">
      <div class="icon">📊</div>
      <h3>Agent Markets</h3>
      <p>Turn on/off, add/remove, test agents. Personal agent-tailored investment strategies. Use other people's agents or build your own.</p>
    </div>
    <div class="card">
      <div class="icon">🛡️</div>
      <h3>Trust-First Compliance</h3>
      <p>KYC/AML built into a frictionless flow that feels like a modern neobank, not an interrogation. Safe for users. &lt;15% drop-off rate.</p>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- ═══ WHAT MAKES US SEXY ═══ -->
<div class="section" style="text-align:center;">
  <h2>What Makes Us <em>Different</em></h2>
  <p class="sub" style="margin-left:auto; margin-right:auto;">Not just another crypto card. The financial intelligence layer of the future.</p>
  <div class="grid4">
    <div class="card" style="text-align:center;">
      <div class="icon">🧠</div>
      <h3>Agentic Financial Intelligence</h3>
    </div>
    <div class="card" style="text-align:center;">
      <div class="icon">🔮</div>
      <h3>Autonomous Market Making</h3>
    </div>
    <div class="card" style="text-align:center;">
      <div class="icon">📈</div>
      <h3>Prediction Markets</h3>
    </div>
    <div class="card" style="text-align:center;">
      <div class="icon">💳</div>
      <h3>Crypto → Visa Instantly</h3>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- ═══ ARCHITECTURE ═══ -->
<div class="section">
  <h2>How It <em>Works</em></h2>
  <p class="sub">Base is the settlement layer. our card issuing partner is the card issuer. Neural Net is the brain.</p>
  <div class="arch">
User deposits crypto on ANY of 23 chains
    ↓
Nuro detects deposit → bridges to Base (CCTP / LayerZero)
    ↓
USDC settles in user's vault on Base
    ↓
User (or their agent) can:
  → Spend via Visa card (vault → card issuer → card credited instantly)
  → Deploy AI trading agents (vault → agent wallet)
  → Enter prediction markets (vault → escrow → oracle resolves)
  → Send to friend's card, wallet, or agent (P2P by email)
  → Withdraw to any chain or external wallet
    ↓
Neural Net tracks everything → learns → optimizes → grows
  </div>
</div>

<div class="divider"></div>

<!-- ═══ TRACTION ═══ -->
<div class="section">
  <h2>Traction</h2>
  <p class="sub">Real product. Real infrastructure. Real processed volume.</p>
  <div class="grid3">
    <div class="card"><div class="num">$2M+</div><h3>On-Chain Volume</h3><p>Total processed through our crypto → debit card pipeline in early beta tests.</p></div>
    <div class="card"><div class="num">900+</div><h3>Trusted Users</h3><p>Early beta community. &lt;15% onboarding drop-off vs industry standard 38%.</p></div>
    <div class="card"><div class="num">23</div><h3>Chains Live</h3><p>Ethereum, Solana, Base, Arbitrum, Polygon, Avalanche, BSC, zkSync, Scroll + 14 more.</p></div>
    <div class="card"><div class="num">125+</div><h3>Commits</h3><p>Rapid development. 15 engineering sessions. Full-stack: Next.js, Express, PostgreSQL, Solidity.</p></div>
    <div class="card"><div class="num">87</div><h3>Pages Built</h3><p>Dashboard, cards, transactions, markets, agents, arena, vault, wallet — all wired to real APIs.</p></div>
    <div class="card"><div class="num">5</div><h3>Live API Feeds</h3><p>CoinGecko prices, TheSportsDB, Polymarket Gamma, price history charts, real-time data.</p></div>
  </div>
</div>

<div class="divider"></div>

<!-- ═══ TEAM ═══ -->
<div class="section">
  <span class="tag" style="display:inline-block; margin-bottom:16px;">Why Us</span>
  <h2>The Team</h2>
  <p class="sub">Small team. Massive output. Founders who ship.</p>
  <div class="grid2">
    <div class="card team-card">
      <div class="name">Christopher Brignola</div>
      <div class="role">CEO · Co-Founder</div>
      <p>Founded multiple design teams. 10 years in blockchain. Led startups scaling to millions of users. Ships products at scale across B2C/B2B.</p>
      <a href="https://linkedin.com/in/chrisbrignola/" target="_blank" style="font-size:12px; margin-top:12px; display:inline-block;">LinkedIn →</a>
    </div>
    <div class="card team-card">
      <div class="name">Chris Brignola</div>
      <div class="role">CTO · Co-Founder</div>
      <p>Top tier engineer. Founder of GBlock. Interoperability and LayerZero expert. Laying foundational code for USDC/USDT stable coin railways spanning 120 blockchains.</p>
      <a href="https://www.gblock.gg" target="_blank" style="font-size:12px; margin-top:12px; display:inline-block;">GBlock.gg →</a>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- ═══ THE ASK ═══ -->
<div class="section">
  <div class="ask">
    <div class="round">Seed / Pre-Seed Round</div>
    <div class="amount">$150,000</div>
    <div class="type">Equity · SAFE · Token warrant options available</div>
    <div class="use-grid">
      <div class="use-item"><div class="pct">40%</div><div class="desc">Engineering — E2E testing, 23-chain integration, security audit, mobile app</div></div>
      <div class="use-item"><div class="pct">25%</div><div class="desc">Growth — AI agent deployment, social media, community building, partnerships</div></div>
      <div class="use-item"><div class="pct">20%</div><div class="desc">Operations — Infrastructure, RPC credits, card issuing fees, compliance</div></div>
      <div class="use-item"><div class="pct">15%</div><div class="desc">Legal — Licensing, terms of service, regulatory compliance</div></div>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- ═══ CONTACT ═══ -->
<div class="section" style="text-align:center;">
  <h2>Let's Talk</h2>
  <p class="sub" style="margin-left:auto; margin-right:auto;">We move fast. Let's build the bank of the future together.</p>
  <div style="margin-top:24px;">
    <a href="mailto:chris@nuro.finance" style="color:#16e0a9; font-size:20px; font-weight:700;">chris@nuro.finance</a>
  </div>
  <div style="margin-top:16px; display:flex; gap:24px; justify-content:center; flex-wrap:wrap;">
    <a href="https://app.nuro.finance" target="_blank" class="secondary" style="padding:10px 20px; border-radius:10px; font-size:13px;">Live App →</a>
    <a href="https://drive.google.com/file/d/1ZuLNW8qKIk_WyZhYnXGRFP0fRpE_hktP/view" target="_blank" class="secondary" style="padding:10px 20px; border-radius:10px; font-size:13px;">Pitch Deck →</a>
    <a href="https://linkedin.com/in/chrisbrignola/" target="_blank" class="secondary" style="padding:10px 20px; border-radius:10px; font-size:13px;">LinkedIn →</a>
  </div>
</div>

<div class="footer">
  Nuro Finance © 2026 — Confidential. For qualified investors only.<br/>
  Investor Presentation · 2026
</div>

</body>
</html>`
}
