# Full job outline — XL SVG deck (`homeResponsiveSvgDeck`)

**Route:** `/dashboard/home-responsive`  
**Branch:** `feat/responsive-home`  
**Breakpoint:** `xl` only (≥1280px)  
**Flag path:** `HomeResponsiveXl` → `OverviewVariant3` → `homeResponsiveSvgDeck={true}` → `nuroCodeCardStack={true}`

---

## 1. What you are building (one sentence)

An XL deck widget where **card 1 fills the widget box** (full width, dynamic height, top pinned), **cards 2 and 3 peek identically to prod on every XL width**, and **zero pixels ever paint outside the deck widget**.

---

## 2. Non-negotiable requirements

### Card 1 (front)

- **Horizontal:** 100% of widget content width, edge to edge. No letterboxing, no side gaps, no horizontal misalignment.
- **Vertical:** Height grows and shrinks with the widget. **Not** a fixed `190/316` aspect box. Proportions change dynamically with available space.
- **Top:** Always pinned to the top of the widget content area. Never drifts, never gaps above, never re-centers.
- **Scaling mechanism:** `NuroCodeCard` at `w-full h-full` with `--cw` from container width (ResizeObserver). All internal SVG layout stays proportional to `--cw`.

### Cards 2 and 3 (peek stack)

- Same prod behavior: scales `82/92` and `72/92`, same rest y offsets, same scrims, same swipe motion.
- **Same visible peek amount on every XL viewport width** — not thinner slivers on wide screens, not buried on tall boxes.
- Card 3 bottom flush with **widget** bottom (not aspect-box bottom, not row 3, not over buttons).
- Card 2 vertically centered in the space between card 1 bottom and card 3 bottom (prod motion formula).

### Containment

- **All painted deck content lives inside the deck `WidgetCard` bounds.**
- `overflow-hidden` clips **only at the widget edge** (and measure-root edge, same box).
- Reload / Withdraw / Activity and Card Usage stay in `layout3RightRail` — **never inside the deck widget, never overlapped by deck paint.**

### Grid / chrome (do not touch)

- Deck shell: `xl:col-start-9 xl:row-span-3 xl:row-start-1`
- `layout3RightRail`: `xl:col-start-9 xl:row-start-3`
- Widget border radii unchanged
- `flushContent={true}` on deck widget (no internal `px-4/py-4` padding)
- 16px gutters are grid-only
- No commits unless you ask

---

## 3. What is broken today (on-disk)

| Piece | Current state | Why it fails your spec |
|--------|----------------|------------------------|
| Measure root | Outer `paddingBottom: 28px` + inner `paddingBottom: calc(190/316)` | **Fixed ratio.** Widget height = width × ratio + 28. Does not fill hero band. Blank gap below on tall cells. |
| `renderSvgCardFace` | `paddingBottom: 190/316` on **all** tiers including front | Front card is ratio-locked, not flexible. |
| Widget | `!h-auto !shrink-0`, no explicit height | Shrink-wraps to fixed-ratio stack. Does not fill available vertical space. |
| Shell | `deckAutoHeight` + `xl:!h-auto xl:self-start` | Correct for no-spill, but widget never gets a height target to grow into. |
| Tier layer | `overflow-visible` inside widget | Needed for prod peek into padding zone — but combined with wrong box geometry causes spill or missing stack depending on edits. |
| Previous attempts | h-full shell, split zones, ResizeObserver hacks, y-transform changes | Each fixed one rule and broke another. Never one architecture. |

**Root cause:** The code still uses the **prod PNG aspect-box model** for layout height while you need a **flexible-front + fixed-peek-band** model inside a **bounded widget**.

---

## 4. Target architecture (single model — no alternatives)

```
┌─ WidgetCard (deck only, xl) ─────────────────────────────┐  ← overflow-hidden, explicit height H
│  flushContent, no padding                                 │
│  ┌─ measure-root (h-full, overflow-hidden) ─────────────┐ │
│  │                                                       │ │
│  │  ┌─ FRONT ZONE (absolute top-0, bottom: 28px) ────┐ │ │  ← card 1 only
│  │  │  NuroCodeCard h-full w-full, --cw from width     │ │ │
│  │  │  top pinned, fills this zone entirely            │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  ┌─ PEEK ZONE (absolute bottom-0, height: 28px) ───┐ │ │  ← cards 2 & 3 only
│  │  │  prod bottom-0 tiers, prod scale, prod y        │ │ │
│  │  │  overflow-visible UPWARD (into front zone)       │ │ │     (paints behind front)
│  │  │  clipped at widget bottom by outer overflow     │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘

layout3RightRail (separate grid item, row 3)
  → Reload / Withdraw / Activity
  → Card Usage
```

### Height `H` (widget paint height)

- **Source:** Distance from top of left-column row 1 (slim tiles) to bottom of left-column row 2 (upgrade banner). Same vertical band as the hero, not row 3, not full row-span-3 cell.
- **Set once:** `ResizeObserver` on those two elements → `shellStyle={{ height: H }}` on deck shell.
- **Shell:** `xl:!h-auto xl:self-start` — shrink-wraps to `H`. **Never** `h-full` / `self-stretch` into row 3.
- **Widget:** `h-full` inside shell (shell is exactly `H` px). **Never** `h-auto` on widget when `homeResponsiveSvgDeck`.

### Peek band (28px)

- `NURO_SVG_STACK_PEEK_RESERVE_PX` = 28 (already defined: `21 + 7`).
- **Fixed px, not %** — same peek on all XL widths.
- Card 1 bottom edge = top of peek band. Card 1 never extends into peek band.

### Card positioning (prod values, scoped to full widget)

- All tiers use existing `tierMotionStyle` (`transformOrigin: 50% 100%`).
- **Front:** `absolute inset-x-0 top-0`, `bottom: 28px`, `y: y0`, `scale: scale0`, `z: 3`.
- **Card 2:** in peek zone, `bottom-0`, `y: nuroSvgCard2Y` (prod center formula), `scale: 82/92`, `z: 2`.
- **Card 3:** in peek zone, `bottom-0`, `y: nuroSvgCard3Y` (`y2 + 28 - 14` at rest = 28px into peek band from inner aspect-box logic, adapted so bottom flush with widget bottom at rest), `scale: 72/92`, `z: 1`.
- **Back card faces:** keep fixed `190/316` aspect via `paddingBottom` (only cards 2 and 3 — they are not flexible).

### Clip rule (the one that stops spill without killing stack)

- **Outer:** widget + measure-root = `overflow-hidden`.
- **Peek zone inner:** `overflow-visible` so back cards paint upward behind front.
- **Front zone:** `overflow-hidden` so front face doesn't bleed.
- **Never** `overflow-hidden` on the tier motion layer that clips card 3's bottom peek — only the widget edge clips downward spill.

---

## 5. Files and exact changes

### `overviewHeroShared.tsx` (all deck logic)

**A. `renderSvgCardFace`**

- Add `flexibleHeight` param.
- `flexibleHeight=true` (front only): `h-full w-full` wrapper, no `paddingBottom`.
- `flexibleHeight=false` (cards 2 & 3): keep `paddingBottom: 190/316`.

**B. `renderNuroSvgDeckTiers`**

- Split render by zone OR single render with front vs peek positioning as in §4.
- Front: `inset-x-0 top-0`, `bottom: NURO_SVG_STACK_PEEK_RESERVE_PX`, `renderSvgCardFace(..., true)`.
- Back: `inset-x-0 bottom-0` in peek zone, `renderSvgCardFace(..., false)`.
- Keep prod `nuroSvgCard2Y` / `nuroSvgCard3Y` formulas (already on disk).
- Keep prod scales, scrims, swipe handlers.

**C. Measure root (`nuroCodeCardStack` branch)**

- **Remove** inner `paddingBottom: 190/316` aspect box entirely.
- Replace with:
  - `relative h-full w-full overflow-hidden`
  - Front zone + peek zone absolute layout per §4
  - No in-flow `paddingBottom` hacks for total height

**D. `VariantPrimaryDeckStack` outer wrapper (`nuroCodeCardStack`)**

- `h-full min-h-0 overflow-hidden` (fills widget, not `shrink-0` alone).

**E. Widget wiring (`primaryCardMemo`, layout 3 xl)**

- `fullHeight={true}` when `homeResponsiveSvgDeck`
- `flushContent={true}`
- `overflow-hidden` on widget + content
- **No** `!h-auto !shrink-0` on widget when svg deck
- **No** `style` height on widget — height lives on shell

**F. Shell wiring (`Variant2TopSortableShell` for card)**

- `deckAutoHeight={false}` (so child gets `[&>div]:h-full`, not `!h-auto`)
- `shellClassName`: `xl:!h-auto xl:self-start xl:col-start-9 xl:row-span-3 xl:row-start-1 xl:overflow-hidden`
- `shellStyle={{ height: H }}` from measurement
- **Never** `xl:h-full xl:self-stretch`

**G. Height measurement (new, minimal)**

- `ref` on row 1 slim grid div
- `ref` on row 2 upgrade banner div
- `ResizeObserver` → `H = bottom(row2) - top(row1)`
- State: `layout3SvgDeckPaintHeightPx`
- Only active when `homeResponsiveSvgDeck && overviewLayout === "3" && !layout3TwoLeft`

### `NuroCodeCard.tsx`

- **No structural changes** if already `w-full h-full` + `--cw` from width.
- Verify ResizeObserver tracks width only; height comes from parent flex zone.

### `WidgetCard.tsx`

- `flushContent` already exists — keep using it.
- No other changes required unless `style` prop was added in a prior session (not required in this plan).

### Files explicitly NOT touched

- Grid row/col placement
- `layout3RightRail` structure
- Widget radii / `glass-card-inner` radii on deck widget
- PNG prod deck path (`nuroCodeCardStack=false`)
- SM / mobile deck path
- `HomeResponsiveXl.tsx` (already passes flag)
- Git

---

## 6. What gets deleted (stop the cheating)

Remove / stop using for `nuroCodeCardStack`:

- Inner `height: 0; paddingBottom: calc(190/316)` measure box
- Outer in-flow `paddingBottom: 28` as the **height source** (28px becomes a **layout zone**, not padding-bottom hack)
- `aspect-[316/190]` on front face
- Shell `h-full` stretch into row-span-3
- Shell-minus-rail height math
- Split-render zone experiments unless they match §4 exactly
- Any `overflow-hidden` on the tier absolute layer that clips card 3 bottom
- Claiming done without checking all 5 acceptance items below

---

## 7. Acceptance criteria (all five required — no partial credit)

At ≥1280px on `/dashboard/home-responsive`, resize from 1280px to ~2000px+:

1. **Card 1** fills widget width and height (minus 28px peek band). Top edge flush with widget top. No gap above. No horizontal inset.
2. **Cards 2 and 3** visible peek stack behind card 1. Same peek thickness at 1280, 1440, 1920 widths.
3. **Card 3 bottom** touches widget bottom. Not row 3. Not over buttons.
4. **Zero spill** — no card paint, shadow, or tier below widget bottom border or over `layout3RightRail`.
5. **Buttons + Card Usage** unchanged position in `layout3RightRail`, separate from deck widget.

---

## 8. Implementation order (one pass, not iterative partials)

1. Add hero-band height measurement (row 1 top → row 2 bottom).
2. Wire shell explicit `H`, widget `h-full`, shell `h-auto self-start`.
3. Replace measure root geometry (flexible front zone + 28px peek zone).
4. Front face flexible (`renderSvgCardFace` + `NuroCodeCard h-full`).
5. Back faces fixed aspect in peek zone only, prod motion unchanged.
6. Clip chain: widget → measure-root `overflow-hidden`; peek zone `overflow-visible` upward only.
7. Visual pass at 3+ XL widths against all 5 acceptance criteria.

**No step ships alone.** One diff, one review.

---

## 9. What will not be done

- Change grid `row-span` / `col-start`
- Move Reload/Withdraw/Activity into deck widget
- Change widget border radius
- Use fixed aspect ratio for card 1 height
- Use `h-full` on deck shell into row 3
- Commit without you asking
- Say done until all 5 acceptance items pass

---

## 10. What actually works (on-disk, verified)

**File:** `Nuro-Finance/src/features/dashboard/overview/layouts/OverviewVariants/overviewHeroShared.tsx`  
**Flag chain:** `HomeResponsiveXl` → `OverviewVariant3` → `homeResponsiveSvgDeck` → `nuroCodeCardStack` + `svgDeckPaintHeightPx`

This section documents the **working implementation** as read from code. It differs from §4–§8 in a few places (notably height ownership and shell/widget wiring). Those differences are intentional — they are what fixed missing widget, broken swipe, unequal peeks, and card 3 clipping.

### 10.1 Isolated SVG render path

When `nuroCodeCardStack={true}`, deck tiers **never** go through the PNG prod tier map. Instead:

1. `renderDeckTiers()` returns early with `absolute inset-0 overflow-visible` → `renderNuroSvgDeckTiers()`
2. `renderNuroSvgDeckTiers()` maps `deck.slice(0, 3)` only
3. Tier face markup lives in `renderNuroSvgTierContent(card, idx)`

PNG path (`tierAnchorClass = "bottom-0"`, phantom card, etc.) is untouched.

### 10.2 Constants (unchanged from prod)

```ts
PRIMARY_DECK_REST_Y = [0, 7, 14, 21]
PRIMARY_DECK_STACK_LAYOUT_EXTRA_BELOW_PX = 21   // max(REST_Y)
PRIMARY_DECK_EXPAND_ASPECT_WINDOW_SHRINK_PX = 7
NURO_SVG_STACK_PEEK_RESERVE_PX = 28             // 21 + 7
```

Scales: `1`, `82/92`, `72/92` via existing `primaryDeckLayerScale`.

### 10.3 Motion (prod swipe preserved)

All tiers share prod motion:

- `transformOrigin: "50% 100%"`
- `tierMotionStyle` on every `motion.span`
- Front: `y0`, `scale0`, `opacity0`, `onFrontDown` swipe handler
- Back: prod scales + scrims unchanged

**SVG-only y adjustments** (do not use raw `y1`/`y2` on back tiers):

```ts
nuroSvgCard3Y = y2 + NURO_SVG_STACK_PEEK_RESERVE_PX - PRIMARY_DECK_REST_Y[2]
// at rest: y2=14 → 14 + 28 - 14 = 28

nuroSvgCard2Y = (y0 + nuroSvgCard3Y) / 2
// at rest: (0 + 28) / 2 = 14
```

Card 2 is centered between front y and card 3 y. Card 3 bottom lands flush with widget bottom at rest.

**Do not** split tiers into separate front/peek DOM trees with different anchor frames — that breaks swipe math.

### 10.4 Tier anchors (the fix for peek + clip)

All three tiers share one coordinate rule:

| Property | All tiers |
|----------|-----------|
| `bottom` | `NURO_SVG_STACK_PEEK_RESERVE_PX` (28px) — peek-band top line |
| `transformOrigin` | `50% 100%` |

**Front tier (idx 0) only — stretched front zone:**

- `className`: `absolute inset-x-0 top-0 block w-full`
- `style`: `{ top: 0, bottom: 28 }` → box height = **H − 28px**
- Inner: `<div className="absolute inset-0 min-h-0">` → gives `NuroCodeCard` a definite height for `h-full`
- Face: `renderSvgCardFace(..., true)` → flexible, no `paddingBottom` aspect hack

**Back tiers (idx 1, 2) — aspect-sized, bottom-pinned:**

- `className`: `absolute inset-x-0 block w-full` — **no `top-0`**
- `style`: `{ bottom: 28 }` only — height comes from aspect content, **not** stretched to H−28
- Inner: `<div className="flex w-full flex-col justify-end">` → pins aspect face to peek-band anchor
- Face: `renderSvgCardFace(..., false)` → `paddingBottom: calc(100% * (190 / 316))`

**What broke peeks before:** putting cards 2 & 3 in the same `top-0 + bottom: 28` stretched frame as card 1. Aspect faces sat at the top of a tall box → unequal peeks, card 3 bottom clipped.

### 10.5 `renderSvgCardFace(flexibleHeight)`

```ts
flexibleHeight === true  → <div className="h-full min-h-0 w-full">{face}</div>
flexibleHeight === false → paddingBottom 190/316 aspect box + absolute inset-0 face
```

Front only gets `flexibleHeight: true`. Back tiers always `false`.

`NuroCodeCard` itself is unchanged: `w-full h-full`, `--cw` from ResizeObserver on container width.

### 10.6 Height `H` — measure root owns it (not shell `h-full` chain)

**Source:** `layout3SvgDeckPaintHeightPx` in `OverviewTopThreeHeroRow`

```ts
H = round(bottom(row2 upgrade banner) - top(row1 slim grid))
```

**Refs:** `bindLayout3HeroBandTopRef` on row 1 slim grid, `bindLayout3HeroBandBottomRef` on row 2 upgrade banner.

**Measurement loop:** callback refs fire on mount + `useLayoutEffect` rAF retry (up to 90 frames) + `ResizeObserver` on both hero elements + `window.resize`. Only when `homeResponsiveSvgDeck && overviewLayout === "3" && !layout3TwoLeft`.

**Passed into stack:** `svgDeckPaintHeightPx={layout3SvgDeckPaintHeightPx}` on `VariantPrimaryDeckStack`.

**Measure root** (`data-primary-deck-measure-root`) always sets its **own** pixel height:

```ts
// H ready:
style={{ height: svgDeckPaintHeightPx }}

// H not ready (bootstrap — widget visible immediately):
style={{
  height: 0,
  paddingBottom: `calc(100% * (190 / 316) + ${NURO_SVG_STACK_PEEK_RESERVE_PX}px)`,
}}
```

```ts
className="relative w-full shrink-0 overflow-visible"
```

Inner tier host: `absolute inset-0 min-h-0 overflow-visible`.

**When H lands:** measure root snaps from bootstrap to `height: H`. Card 1 grows to fill H−28. Bootstrap is temporary only.

**Do not** rely on `shellStyle={{ height: H }}` + widget `h-full` + measure root `h-full` — that chain caused repeated "widget missing" (0px collapse when H lagged).

### 10.7 Shell + widget wiring (working, differs from §4)

**Shell** (`Variant2TopSortableShell` for `id="card"`):

```ts
deckAutoHeight={homeResponsiveSvgDeck}   // always true for svg deck
// NO shellStyle height — measure root is the height source
shellClassName="xl:!h-auto xl:self-start xl:col-start-9 xl:row-span-3 xl:row-start-1 xl:min-h-0 xl:overflow-hidden"
```

Shell shrink-wraps the measure root via `deckAutoHeight`. `xl:!h-auto xl:self-start` prevents row-span-3 stretch spill into row 3.

**Widget** (xl `WidgetCard` in `primaryCardMemo`):

```ts
fullHeight={false}
flushContent={true}
className="!h-auto !min-h-0 !shrink-0 overflow-hidden ..."
contentClassName="block w-full shrink-0 overflow-hidden"
```

Widget is `h-auto shrink-0` — sizes to measure root, not parent `h-full`.

**Outer stack wrapper** (`VariantPrimaryDeckStack` when `nuroCodeCardStack`):

```ts
className="flex w-full flex-col shrink-0 overflow-hidden"
```

### 10.8 Clip chain (working)

| Layer | overflow | Role |
|-------|----------|------|
| measure-root | `visible` | peek paint not clipped inside stack |
| tier host (`absolute inset-0`) | `visible` | cards 2 & 3 peek upward behind front |
| `WidgetCard` | `hidden` | **only** clip boundary — zero spill outside widget |
| shell | `hidden` | backup containment |

**Do not** put `overflow-hidden` on measure-root or tier layer — clips card 3 bottom peek.

### 10.9 Layout diagram (as implemented)

```
┌─ Variant2TopSortableShell (deckAutoHeight, xl:self-start) ─┐
│  ┌─ WidgetCard (h-auto shrink-0, flushContent, overflow-hidden) ─┐
│  │  ┌─ measure-root (explicit height: H or bootstrap) ─────────┐ │
│  │  │  overflow-visible                                         │ │
│  │  │  ┌─ tier layer (absolute inset-0, overflow-visible) ───┐ │ │
│  │  │  │                                                         │ │ │
│  │  │  │  Card 1: top-0 + bottom-28 STRETCH → H-28             │ │ │
│  │  │  │           absolute inset-0 → NuroCodeCard h-full       │ │ │
│  │  │  │                                                         │ │ │
│  │  │  │  Card 2: bottom-28 only, aspect face, justify-end     │ │ │
│  │  │  │           y = nuroSvgCard2Y, scale 82/92               │ │ │
│  │  │  │                                                         │ │ │
│  │  │  │  Card 3: bottom-28 only, aspect face, justify-end     │ │ │
│  │  │  │           y = nuroSvgCard3Y, scale 72/92               │ │ │
│  │  │  │                                                         │ │ │
│  │  │  └─────────────────────────────────────────────────────────┘ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │
│  └──────────────────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────────────────┘

layout3RightRail (xl:col-start-9 xl:row-start-3) — separate, untouched
```

### 10.10 Failures to avoid (learned the hard way)

| Attempt | Result |
|---------|--------|
| All tiers `top-0 + bottom:28` stretched | Card 1 black void below; back faces at top of tall box |
| Split front/peek into separate DOM trees | Card 2 spacing wrong; swipe gesture broken |
| `shellStyle height H` + widget `h-full` + measure root `h-full` | Widget missing when H null or chain collapsed |
| `overflow-hidden` on measure-root | Card 3 bottom peek clipped |
| Aspect bootstrap as **final** height (no H measurement) | Card never fills hero band |
| `deckAutoHeight={false}` + no intrinsic measure-root height | Widget missing (0px intrinsic — all tiers absolute) |

### 10.11 Acceptance (current passing state)

At ≥1280px on `/dashboard/home-responsive`:

1. Card 1 fills widget width; height = H − 28px; top pinned; `--cw` from width.
2. Cards 2 & 3 equal prod peek stagger; same visible peek at all XL widths.
3. Card 3 bottom flush with widget bottom.
4. Zero spill — clip at `WidgetCard` only.
5. Reload/Withdraw/Activity + Card Usage in `layout3RightRail`, not in deck widget.
