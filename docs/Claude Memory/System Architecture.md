# AFI System Architecture

> Canonical map of how AFI's pieces talk to each other. Updated as of Session 25 (2026-04-19).
> Source of truth for: `Cashly_Source_Code/` layout, VPS runtime, external integrations, on-chain infra.
> Rendered visually at [`app.nuro.finance/architecture.html`](https://app.nuro.finance/architecture.html).

**Core principle**: Intent Layer records intent. Execution Layer moves real money. Never conflate.

---

## 1. System-wide flow (the 30,000-ft view)

```mermaid
flowchart LR
    subgraph Client["🖥️ Client — Browser"]
        UI[Next.js 15.5.14 FE<br/>app.nuro.finance]
        Wallet[Wagmi / Privy<br/>wallet connector]
    end

    subgraph Auth["🔐 Auth Layer"]
        NAuth[NextAuth v5<br/>JWT sessions]
    end

    subgraph Proxy["⚡ Next.js Edge — port 2800"]
        NR["/api/* route handlers<br/>(proxy to backend)"]
        Static["/public/* static HTML<br/>(dashboards)"]
    end

    subgraph Backend["⚙️ Express Backend — port 3000"]
        NuroR[nuro-routes.ts<br/>REST API]
        AdminC[admin-console.ts<br/>ops dashboard]
        Monitor[monitor.ts<br/>pollChain + pollNative<br/>+ pollErc20 + pollSolana]
        Exec[execution-dispatch.ts<br/>sweeps queue]
        Swap[swap.ts<br/>0x allowance-holder]
        Bridge[bridge.ts<br/>CCTP + LZ]
        Mythos[growth-agent/*<br/>thought-engine + approval]
    end

    subgraph DB["💾 Postgres — port 5432"]
        Users[(users · cards<br/>transactions · transfers)]
        Agent[(agents · agent_fundings<br/>agent_bets · agent_profits)]
        AllowL[(erc20_allowlist)]
        ExecLog[(execution_log)]
        Growth[(growth_agent_memory<br/>growth_agent_posts<br/>post_engagement)]
    end

    subgraph External["🌐 External Services"]
        Zerox[0x Aggregator v2]
        Circle[Circle CCTP]
        LZ[LayerZero V2]
        SD3[SD3 Issuer<br/>Visa card network]
        TG[Telegram]
        MB[Moltbook]
        TW[Twitter v2]
        HG[HeyGen]
    end

    subgraph Chain["⛓️ On-Chain — 23 chains"]
        EVM[EVM 22 chains<br/>ETH · Base · Arb · etc.]
        Sol[Solana]
    end

    UI --> NAuth
    UI --> NR
    UI --> Static
    Wallet --> EVM

    NR --> NuroR
    NuroR --> DB
    NuroR --> Swap
    NuroR --> Bridge
    AdminC --> ExecLog
    AdminC --> AllowL

    Monitor --> EVM
    Monitor --> Sol
    Monitor --> Exec
    Exec --> Bridge
    Exec --> DB

    Swap --> Zerox
    Swap --> EVM
    Bridge --> Circle
    Bridge --> LZ
    Bridge --> EVM
    Bridge --> Sol

    Mythos --> TG
    Mythos --> MB
    Mythos --> TW
    Mythos --> HG
    Mythos --> Growth

    NuroR --> SD3
    Exec --> SD3

    style Client fill:#1a1a2e,stroke:#16e0a9
    style Backend fill:#1a1a2e,stroke:#c770f0
    style DB fill:#1a1a2e,stroke:#5b8def
    style External fill:#1a1a2e,stroke:#f5a623
    style Chain fill:#1a1a2e,stroke:#ff6b6b
```

---

## 2. Critical path: User deposit → Card credit

The canonical money-movement flow. Everything else is a variant.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Wallet as User Wallet
    participant Chain as Source Chain
    participant Monitor as Monitor (backend)
    participant Swap as swap.ts (0x)
    participant Bridge as bridge.ts (CCTP)
    participant Base as Base chain
    participant SD3 as SD3 Issuer
    participant Card as Visa Card

    User->>Wallet: Click "Send USDC"
    Wallet->>Chain: tx: transfer USDC → deposit address
    Chain-->>Monitor: poll detects USDC balance
    Monitor->>Bridge: CCTP burn + attest
    Bridge->>Circle: getAttestation
    Bridge->>Base: CCTP mint at user's Issuer-linked address
    Base-->>SD3: webhook fires on deposit
    SD3->>Card: credit balance
    SD3-->>Monitor: sync via /balances
    Monitor-->>User: notification (Telegram + UI)

    Note over Monitor,Base: If deposit is native ETH/MATIC/etc.<br/>Monitor → Swap (0x) → USDC → CCTP path<br/>Same end result, one extra hop
```

**Variants**:
- **Native token path**: Monitor detects ETH/MATIC/BNB/AVAX/S/HYPE → `swap.ts::executeNativeToUsdcSwap` → USDC lands at same address → pollChain picks it up → CCTP bridge. (Session 23 Marathon 7)
- **ERC-20 path**: Monitor detects LINK/UNI/WBTC/WETH/cbBTC or memecoin (SHIB/PEPE/PENGU/ANDY) → `executeErc20ToUsdcSwap` (approve + swap) → same terminus.
- **Base-direct path**: USDC already on Base → skip CCTP, send directly to Issuer address.
- **Solana path**: Solana CCTP via `@circle-fin/bridge-kit` → Base mint → Issuer.

---

## 3. Reload Card UI → Backend flow

```mermaid
flowchart TD
    User[User opens Reload Card modal]
    User --> FetchToks[GET /api/supported-tokens<br/>live erc20_allowlist + natives + stables]
    FetchToks --> Pick{Pick category}
    Pick -->|Stables| Direct[USDC/USDT/DAI<br/>direct deposit]
    Pick -->|Natives| NatPick[ETH/MATIC/BNB/AVAX/S/HYPE<br/>auto-select chain]
    Pick -->|Memecoins| MemePick[SHIB/PEPE/PENGU/ANDY<br/>Ethereum-only for now]

    NatPick --> Amount
    MemePick --> Amount
    Direct --> Amount[Enter amount]

    Amount --> Quote[GET /api/quote/swap<br/>0x /price endpoint]
    Quote -->|degraded| Fallback[Show '~estimate unavailable']
    Quote -->|ok| Preview[Show ≈USDC + worst-case slippage]

    Preview --> Send{Send method}
    Send -->|One-click| Wagmi[WalletDepositButton<br/>sendTransaction]
    Send -->|Manual| QR[Show address + QR]

    Wagmi --> Tx[Wallet prompts tx]
    QR --> Tx
    Tx --> Monitor[Monitor detects → swap/bridge → card]
```

---

## 4. Mythos daily cycle

```mermaid
stateDiagram-v2
    [*] --> Perceive: runDailyGrowthCycle()

    Perceive: Perceive market<br/>(CoinGecko + Polymarket trending)
    Perceive --> Think

    Think: Think via LLM<br/>(thought-engine.ts)
    Think --> Generate

    Generate: Generate content<br/>(crypto posts + market predictions + education)
    Generate --> Gate

    Gate: Quality gate<br/>(quality-gate.ts)
    Gate --> Risk

    Risk: Risk classifier<br/>(low/medium/high)
    Risk --> AutoApprove: low risk
    Risk --> Queue: medium/high

    AutoApprove: Auto-approved<br/>→ post immediately
    AutoApprove --> Publish

    Queue: Queue for admin<br/>→ Telegram with Approve/Reject buttons
    Queue --> Wait

    Wait: Wait for callback<br/>(10s poll loop)
    Wait --> Publish: Approve
    Wait --> Reject: Reject
    Wait --> Expire: 2h timeout → auto-approve medium

    Publish: Post to platform<br/>(moltbook/twitter/telegram)
    Publish --> Seed: seedPostEngagement(t=0)
    Seed --> Track

    Track: Hourly engagement fetch<br/>(engagement-fetcher.ts)
    Track --> Learn

    Learn: [Session 25+] Weight next<br/>cycle by engagement
    Learn --> [*]

    Reject: Log rejection<br/>(for future learning)
    Reject --> [*]

    Expire: Mark expired
    Expire --> [*]
```

---

## 5. Database schema (key relations)

```mermaid
erDiagram
    users ||--o{ cards : has
    users ||--o{ transactions : makes
    users ||--o{ transfers : sends
    users ||--o{ agents : owns
    users {
        varchar id PK
        varchar email
        varchar issuer_user_id
        varchar sd3_user_id
        varchar payout_destination
        varchar solana_deposit_address
    }
    cards {
        varchar id PK
        varchar user_id FK
        varchar issuer_card_id
        decimal balance
        varchar status
    }
    transactions ||--o{ execution_log : logged_in
    transactions {
        varchar id PK
        varchar user_id FK
        decimal amount
        varchar status
        integer source_chain
        integer dest_chain
        varchar tx_hash
    }
    agents ||--o{ agent_fundings : receives
    agents ||--o{ agent_bets : places
    agents ||--o{ agent_profits : earns
    agents {
        uuid id PK
        varchar user_id FK
        varchar wallet_address
        varchar status
        decimal total_funded
        decimal total_invested
    }
    erc20_allowlist {
        uuid id PK
        integer chain_id
        varchar symbol
        varchar contract_address
        varchar category
        boolean enabled
        date audited_at
    }
    execution_log }o--|| users : references
    execution_log {
        uuid id PK
        varchar entity_type
        varchar entity_id
        varchar action
        varchar status
        timestamptz created_at
    }
    growth_agent_posts ||--o{ post_engagement : tracked_by
    post_engagement {
        uuid id PK
        uuid post_uuid FK
        varchar platform
        integer likes
        integer retweets
        integer replies
        integer impressions
        timestamptz sampled_at
    }
    schema_migrations {
        varchar version PK
        varchar filename
        timestamptz applied_at
        text notes
    }
```

---

## 6. External service topology

```mermaid
flowchart LR
    Backend[AFI Backend]

    subgraph MoneyRouting["💰 Money movement"]
        Zerox[0x Aggregator v2<br/>native + ERC-20 swaps]
        Circle[Circle CCTP<br/>USDC burn+mint]
        LZ[LayerZero V2<br/>OFT cross-chain]
        SD3["SD3 Issuer<br/>(Owen)<br/>Visa card + KYC"]
    end

    subgraph Content["📣 Content + Growth"]
        TG[Telegram Bot API<br/>admin approvals]
        MB[Moltbook API<br/>primary platform]
        TW[Twitter v2 API<br/>OAuth1 post + Bearer read]
        HG[HeyGen API<br/>avatar video]
    end

    subgraph AI["🧠 AI / ML"]
        Anth[Anthropic Claude<br/>(thought-engine)]
        CG[CoinGecko<br/>market data]
        PM[Polymarket CLOB<br/>agent trades]
    end

    Backend --> Zerox
    Backend --> Circle
    Backend --> LZ
    Backend --> SD3
    Backend --> TG
    Backend --> MB
    Backend --> TW
    Backend --> HG
    Backend --> Anth
    Backend --> CG
    Backend --> PM

    style MoneyRouting fill:#1a1a2e,stroke:#16e0a9
    style Content fill:#1a1a2e,stroke:#c770f0
    style AI fill:#1a1a2e,stroke:#5b8def
```

---

## 7. On-chain infrastructure

**13 chains support native swap** (Marathon 7): Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, Linea, Scroll, Unichain, World Chain, Sonic, HyperEVM.

**23 chains support stable deposits** (CCTP or LZ bridge): the 13 above + zkSync, Celo, Gnosis, Sei, XDC, Codex, Ink, Plume, Monad, Solana.

```mermaid
flowchart TD
    Deposit[User deposit address<br/>HD-derived per user]

    subgraph Routes["Routing by chain"]
        R1[USDC on Base → direct to SD3]
        R2[USDC on CCTP-chain → burn → mint on Base]
        R3[USDC on LZ-only chain → OFT bridge → Arb hub → CCTP → Base]
        R4[Native token → 0x swap → USDC → routes above]
        R5[ERC-20 allowlist token → 0x swap → USDC → routes above]
        R6[Solana USDC → Circle Bridge Kit → Base]
    end

    Deposit --> R1
    Deposit --> R2
    Deposit --> R3
    Deposit --> R4
    Deposit --> R5
    Deposit --> R6

    R1 --> Base[Base: Issuer address]
    R2 --> Base
    R3 --> Base
    R4 --> Base
    R5 --> Base
    R6 --> Base

    Base --> SD3[SD3 webhook → card credit]
```

---

## 8. Neural Net (my own brain)

Two dashboards at `app.nuro.finance/*`:
- **`/sub-agents-dashboard.html`** — orchestration topology (119 nodes, 131 links). Live health + invocation heat.
- **`/neural-dashboard.html`** — decision playback. File-access traces over time.
- **`/unified-dashboard.html`** *(Session 25 target)* — overlays both.

```mermaid
flowchart LR
    UserQ[User query]

    subgraph Orchestrator
        Mythos["mythos central node"]
    end

    subgraph SkillTypes["Skill types"]
        OnD[On-demand skills<br/>auditor · bridge · deployer<br/>encode · gate-check · /boot]
        Sched[Scheduled skills<br/>gate-completeness-audit<br/>hourly-check · daily-cycle]
        Kernel[Kernel skills<br/>memory · config · gates.yaml]
    end

    subgraph Artifacts
        Docs[Neural Net docs<br/>130+ .md files]
        Code[Cashly_Source_Code/src]
        VPSState[VPS PM2 state]
    end

    UserQ --> Mythos
    Mythos --> OnD
    Mythos --> Sched
    Mythos --> Kernel

    OnD -->|reads| Docs
    OnD -->|reads+writes| Code
    OnD -->|queries| VPSState
    Sched -->|reads+writes| Docs
    Kernel -->|configures| OnD
    Kernel -->|configures| Sched

    Code -->|logs| ExecLog[(execution_log)]
    OnD -.->|Session 25: SubagentStop hook| ExecLog
    ExecLog -->|feeds| SkillHealth[/api/skill-health/]
    SkillHealth -->|powers| Dashboards[Sub-Agents + Neural + Unified]
```

---

## 9. Request lifecycle (canonical — Reload Card)

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant NextJS as Next.js FE<br/>(2800)
    participant NextAPI as Next.js /api proxy
    participant Express as Express BE<br/>(3000)
    participant DB as Postgres
    participant Zerox as 0x API
    participant Chain as Source chain
    participant Base as Base chain
    participant SD3 as SD3 Issuer

    Browser->>NextJS: GET /dashboard/my-card-1
    NextJS->>NextAPI: GET /api/supported-tokens
    NextAPI->>Express: GET /supported-tokens
    Express->>DB: SELECT erc20_allowlist WHERE enabled
    DB-->>Express: rows
    Express-->>NextAPI: JSON (stables/natives/bluechips/memecoins)
    NextAPI-->>Browser: cached 60s

    Browser->>NextAPI: GET /api/quote/swap?chainId=1&sellToken=SHIB&amount=10000
    NextAPI->>Express: GET /quote/swap
    Express->>Zerox: /swap/allowance-holder/price
    Zerox-->>Express: buyAmount, minBuyAmount
    Express-->>Browser: preview USDC

    Browser->>Chain: wallet tx (SHIB transfer to deposit addr)
    Chain-->>Express: (async) Monitor.pollErc20Balance detects
    Express->>Zerox: getErc20SwapQuote
    Express->>Chain: approve + swap tx
    Chain-->>Express: USDC arrives at deposit address
    Express->>Base: CCTP burn (via bridge.ts)
    Base-->>SD3: webhook on USDC mint
    SD3-->>Express: sync balance
    Express->>DB: INSERT transactions, UPDATE cards
    Express-->>Browser: (via UI refresh) card balance updated
```

---

## 10. Deployment topology

```mermaid
flowchart LR
    GH[GitHub<br/>Build_Branch]

    subgraph Dev["Dev machine (Richard)"]
        Local[C:/Users/Richa/AFI/Cashly_Source_Code]
        Push[git push<br/>verify-deps + typecheck + vitest gate]
    end

    subgraph VPS["VPS 74.50.109.203"]
        CashlyRepo[~/Cashly<br/>backend repo]
        FERepo[~/nuro-finance-dashboard<br/>frontend repo]

        subgraph PM2["PM2"]
            BE["cashly-middleware (id 4)<br/>tsx src/index.ts<br/>port 3000"]
            FE["cashly-frontend (id 1)<br/>next start<br/>port 2800"]
        end

        PG[(Postgres 15<br/>port 5432)]
        Nginx[nginx<br/>app.nuro.finance]
    end

    Local -->|git push| GH
    GH -->|git pull| CashlyRepo
    GH -->|git pull| FERepo
    CashlyRepo -.->|tsx runtime| BE
    FERepo -->|next build| FE
    BE --> PG
    Nginx --> FE
    Nginx -.->|Session 25 TODO| BE
```

---

## References

- `Neural Net/Claude Memory/INDEX.md` — master context
- `Neural Net/Claude Memory/tech_decisions_afi.md` (synced to `~/.claude/projects/.../memory/`) — canonical tech patterns
- `Neural Net/Claude Memory/Swap Risk Policy.md` — user eats volatility
- `Neural Net/Claude Memory/Memecoin Allowlist Policy.md` — 5-criteria audit
- `Cashly_Source_Code/docs/Claude Memory/SD3 Card API/` — Issuer integration docs
- `Cashly_Source_Code/src/migrations/` — schema evolution (25 migrations applied)
