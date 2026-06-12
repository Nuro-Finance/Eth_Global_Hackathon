# Nuro Finance — Responsiveness Plan

Living doc for dashboard layout. **Revisit after Pass A.** Responsiveness is **Pass B** — not in parallel with 5.4.26 UI parity.

**Reference UI:** `Nuro Front End 5.4.26` (design source of truth until Pass A is signed off).

---

## Priority (do not mix passes)

| Pass | Goal | When |
|------|------|------|
| **A — 5.4.26 UI parity** | Match reference visuals, flows, modals, swap/send/receive shell, tokens — **desktop-first at ~1280+** | **Now** |
| **B — Responsiveness** | Three-tier contract, resize stability, page templates, container queries | **Next major update** — after Pass A |

**Rule:** No Pass B refactors on files still being aligned to 5.4.26. Finish parity on a surface, then lock it before responsive work there.

---

## Master checklist

### Pass A — 5.4.26 UI in place (current work)

- [ ] **Home** — `OverviewVariant3` / hero / transactions match 5.4.26
- [ ] **My Wallet** — balance, swap panel, send/receive in swap shell (not legacy modals), buy onramps, settings menu
- [ ] **My Card** — per 5.4.26 scope for active route (`my-card-1` or agreed canonical)
- [ ] **Cards / Transactions / Settings** — only pages in active nav; match reference where touched
- [ ] **Modals** — design-system shells (glass, H1/H2, close CTA); no full-black overlays
- [ ] **No drive-by** — no reload skeleton experiments, modal edits, or layout-lock unless explicitly requested
- [ ] **Sign-off** — visual compare vs 5.4.26 at **1440px+**, sidebar expanded; list any known gaps

### Pass B — Responsiveness (next major update — blocked until Pass A sign-off)

- [x] Read **Layout contract** (below) — **three tiers** (mobile / tablet / desktop)
- [x] **Safe lab setup** — branch `feat/responsive-home`, do not edit `/dashboard` in place first
- [x] **Scaffold** — `DashboardTablet`, `DashboardResponsivePage` (`md` / `xl` gates), `overview-responsive/HomeResponsiveLab`
- [ ] **Home lab** — `/dashboard/home-responsive`: implement tablet + mobile **slots** (desktop = Layout 3 at `xl+`)
- [ ] **Home promote** — switch `/dashboard` to lab implementation; remove or redirect lab route
- [ ] **My Wallet** — align `ConnectedWalletDashboard` to three-tier contract
- [ ] **Cards → Transactions → Settings** — rollout order per page
- [ ] **Container queries** (optional Phase 2) — `@container` on main content
- [ ] **Guardrails** — PR checklist, width toolbar on `ui-component`, tier screenshots optional

---

## Git + Pass A (before Pass B)

**Pass B does not require pushing to GitHub first.** Branches are **local** until you choose to push.

Recommended order while 5.4.26 work is still local / unpushed:

1. **Pass A** — keep editing on your current branch (or `main`) until parity sign-off.
2. **Checkpoint (local commit)** — commit Pass A on disk when you’re happy (`5.4.26 parity: wallet, home, …`). Still no push required.
3. **Optional push** — push when you want backup or a PR; not a gate for starting Pass B.
4. **Pass B** — `git checkout -b feat/responsive-home` from that checkpoint; lab route only; merge/push when ready.

If nothing is committed yet, do **one Pass A commit** before Pass B so you can always `git checkout` back to “parity only” without the lab route.

---

## Safe workflow checklist (Pass B only)

Use this so production UI does not break during responsive experiments.

- [ ] Pass A saved as at least one **local commit** (push optional)
- [ ] Work on branch `feat/responsive-*` (never mix Pass B into uncommitted Pass A chaos)
- [ ] **Do not** create `Nuro-Finance-responsive/` duplicate repo — same app, sandbox route only
- [x] Add route `src/app/[locale]/dashboard/home-responsive/page.tsx`
- [x] Lab shell `src/features/dashboard/overview-responsive/HomeResponsiveLab.tsx`
- [x] Shared templates `src/features/dashboard/responsive/` (`DashboardStack`, `DashboardTablet`, `DashboardGrid12`, `DashboardSplit`, `DashboardResponsivePage`)
- [x] Sidebar link **dev only** (`NODE_ENV === 'development'` or `NEXT_PUBLIC_SHOW_RESPONSIVE_LAB=1`) — label “Home (responsive lab)”
- [ ] Compare side by side: `/dashboard` (Pass A) vs `/dashboard/home-responsive` (Pass B)
- [ ] QA widths: **390**, **768**, **1100**, **1280**, **1440**, **1920** — sidebar expanded + collapsed
- [ ] Resize down/up 10× — layout restores; no stuck drag order
- [ ] One PR to promote lab → `/dashboard`; delete lab route or redirect like `overview-3`

---

## QA checklist (Pass B PRs)

- [ ] Sidebar expanded and collapsed
- [ ] **Mobile:** 390, 430
- [ ] **Tablet:** 768, 1024, 1100
- [ ] **Desktop:** 1280, 1440, 1920
- [ ] Resize down then back up matches initial desktop state
- [ ] No horizontal scroll in main content
- [ ] Chat panel open/closed does not break grid (if applicable)

---

## Layout contract (Pass B — reference)

### Three tiers (product names: **sm** / **md** / **xl**)

We use **sm, md, xl** when talking and in code props — not “mobile/tablet/desktop” or “md and below.”

| Name | Viewport | CSS gate | Behavior |
|------|----------|----------|----------|
| **sm** | &lt; 768px | below Tailwind `md` (`md:hidden` branch) | Narrowest layout — **not** Tailwind `sm:` (640px) |
| **md** | 768px – 1279px | `md:block` + below `xl` | Middle layout; md-specific slots (debit card, hero, etc.) |
| **xl** | ≥ 1280px | `xl:` and up | Current wide grid (Layout 3, 12-col, DnD) — **parity target** |

`DashboardResponsivePage` props: `sm`, `md`, `xl`.

### Principles

1. **Three page tiers** — mobile / tablet / desktop; no extra per-page `lg:` hero grids beyond this contract  
2. **CSS first** — `md` / `xl` gates; no `matchMedia` for layout unless necessary; reset JS on tier change  
3. `min-h` not fixed `h-[Npx]` on dashboard cards  
4. DnD **desktop only**; do not persist order across tiers  
5. Slot internals (debit card, graph, reload bar) may differ per tier inside shared templates  
6. Prefer `@container` on main content (Phase 2) over extra viewport breakpoints  

### Page templates (Pass B)

| Template | Tier |
|----------|------|
| `DashboardStack` | sm |
| `DashboardTablet` | md |
| `DashboardGrid12` | xl (wide grid wrapper) |
| `DashboardSplit` | xl wallet-style (`2fr` / `1fr`) |
| `DashboardResponsivePage` | Opt-in `sm` / `md` / `xl` slots |

### Forbidden without review

- `matchMedia` / `ResizeObserver` for grid layout  
- Fixed heights on dashboard cards  
- Persisting drag order across tiers  
- Framer grid animations on every resize  
- Collapsing tablet + mobile into one “stack” layout when product requires two middle/narrow experiences  

### Breakpoints

| Token | px | Tier |
|-------|-----|------|
| below `md` | &lt; 768 | **sm** |
| `md` – below `xl` | 768 – 1279 | **md** |
| `xl` | ≥ 1280 | **xl** |

Content column is narrower than viewport (sidebar 240/64 + padding) — container queries are the long-term fix (Phase 2).

---

## Key files

| Area | Path |
|------|------|
| 5.4.26 reference | `../Nuro Front End 5.4.26/` |
| Dashboard shell | `src/app/[locale]/dashboard/layout.tsx` |
| Home (prod) | `src/app/[locale]/dashboard/page.tsx` → `OverviewVariant3` |
| Home hero | `src/features/dashboard/overview/layouts/OverviewVariants/overviewHeroShared.tsx` |
| Home lab | `src/app/[locale]/dashboard/home-responsive/page.tsx` → `HomeResponsiveLab` |
| Lab shell | `src/features/dashboard/overview-responsive/HomeResponsiveLab.tsx` |
| Responsive templates | `src/features/dashboard/responsive/` |
| My Wallet | `src/features/dashboard/my-wallet/ConnectedWalletDashboard.tsx` |
| Tailwind | `tailwind.config.mjs` (default `md` 768, `xl` 1280) |

---

## Problem notes (why Pass B exists)

- Viewport breakpoints vs narrow content column (sidebar + `px-8`)
- Per-page grid inventing (`sm` / `md` / `xl` mix)
- Fixed heights + JS (`matchMedia`, dnd-kit + `localStorage`) → resize jumps, layout does not snap back
- Home hero worst at widths between ~768–1279px (tablet tier)

---

## Decisions log

| Date | Decision |
|------|----------|
| 2026-06-02 | **Pass A first** — 5.4.26 UI parity; responsiveness deferred to Pass B |
| 2026-06-02 | Pass B via branch + `home-responsive` lab route, not duplicate repo |
| 2026-06-02 | Do not refactor for responsive while a surface is still chasing 5.4.26 |
| 2026-06-03 | Pass B = **three tiers**: **sm** (&lt;768), **md** (768–1279), **xl** (≥1280) |
| 2026-06-03 | Product names sm/md/xl; CSS gates Tailwind `md` + `xl` (sm = below `md`, not Tailwind `sm:`) |
| 2026-06-03 | `DashboardTablet` + `DashboardResponsivePage` (`sm`/`md`/`xl` props); home lab scaffolds md + sm |

---

## Out of scope (Pass B v1)

- Mobile bottom nav
- Full-app responsive rewrite in one sprint
- Pixel-perfect every width 768–1279
- New CSS framework
- Fourth tier (e.g. separate `sm` hero layout)
