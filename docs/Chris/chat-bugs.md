# Assistant chat panel — bug history, root causes, and fix attempts

This document records **symptoms**, **technical analysis**, **everything that was tried** (including approaches that were rejected or reverted), and the **current intended behavior** for the Nuro Intelligence assistant UI (`AssistantChatPanel` and related shell). It exists so future edits do not repeat failed experiments.

**Primary code:** `src/components/AssistantChatPanel.tsx`  
**Shell / overlay:** `src/app/[locale]/dashboard/layout.tsx` (fixed aside, blur plate, resize handle)

---

## ✅ Latest fix (V2): message meta only on hover/tap (no persistence)

**Problem (V2):** Timestamp + action icons (copy/thumbs/refresh) were **persistently visible** and/or **glitchy**.

**Root cause:** The reveal logic used `[@media(hover:none)]` to force meta **always visible** on touch devices, and used **opacity + transition** for show/hide, which is fragile in a **glass + scroll** stack.

**Fix (V2):** In `src/components/AssistantChatPanelV2.tsx` we switched meta reveal to:
- **`visible/invisible`** (no opacity transitions) for hover reveal on `group/msg`
- **Tap-to-toggle** (`openMessageMetaId`) for touch/coarse pointers (instead of “always visible on touch”)
- Removed the extra internal `mt-1` in `MessageActions` that misaligned the meta row

---

## 1. Executive summary

| Topic | What was going wrong | Stable direction |
|------|------------------------|------------------|
| **Rectangles / “boxes” on hover** | Hover **background fills** (`hover:bg-*`) on small controls **inside a CSS-masked, scrolling layer** + aggressive compositor hints → Chromium repaints ugly rectangular patches. | **Do not assume** “opacity-only hover + strip GPU hints + clip composer” fixes it — **Phase 1 was rejected** (see §4.4). Next: **structural** options (mask not on same layer as actions) or **isolated** experiments with **user approval per step**. |
| **“Stuck” hover** | Looks like persistent hover chip on copy / image icon: combination of **:hover** on `button`/`label`, **focus** after click, **`hidden` file inputs**, and compositor weirdness next to masks. | Hypotheses only; **no single class fix** has been validated — **Phase 1 changes did not help** and were **reverted**. |
| **Text leaking below the composer** | Footer card did not **clip** overflowing paint; textarea could draw **past** the rounded glass footer. | **`overflow-hidden` + textarea wrapper** was bundled into Phase 1; **user reported worse overall** — **treat clipping as its own** change with **visual QA**, not bundled with hover experiments. |
| **Scroll-edge fade** | User wants to **keep** the existing **mask-based** fade (not remove it casually). | Inline **`maskImage` / `WebkitMaskImage`** on the messages scroller **retained**; `.scroll-fade-mask` class still applies base mask from `src/styles/theme.css`. |
| **Plate overlay fade (attempt)** | Replacing mask with **top/bottom gradient plates** was tried to avoid mask compositor bugs; user **rejected** when it **broke input clipping** and feel. | **Do not reintroduce** plate overlays for this panel **without** explicit approval and a plan that **does not change** composer layout/clipping. |

---

## 2. User-visible symptoms (screenshots / reports)

1. **Dark rounded rectangle** behind **copy** (and sometimes thumbs) while hovering or **as if hover were stuck**.
2. **Diagonal banding / “glitchy”** background in the input region (stacking of **backdrop-filter**, semi-transparent fills, and **masked** scroll content).
3. **Message or input text** appearing **below** the rounded chat container (clipping failure).
4. **Image / attachment** circular control showing a **persistent gray hover** ring.
5. **Sidebar / rail** (separate thread): **“Menu”** tooltip overlapping breadcrumbs; **Prize Pool** / rail tooltip **blur vs fill** discussion — **not** the same component as `AssistantChatPanel`, but same **glass + compositor** theme.

---

## 3. Technical root causes (verified or strongly likely)

### 3.1 CSS mask on the **same** node as `overflow-y-auto` + interactive children

The messages container uses:

- Class **`scroll-fade-mask`** (global defaults in `src/styles/theme.css`).
- **Inline** gradient overrides on `WebkitMaskImage` / `maskImage` (see `AssistantChatPanel.tsx`).

In Chromium, **parent `mask-image`** forces **special compositing**. Descendants that change appearance on **:hover** (especially **background-color**) often repaint as **sharp rectangles** or **wrong bounds** until the next frame. Project rules (`.cursorrules`) explicitly warn that **mask + backdrop** interactions can flatten layers and break expectations.

**Implication:** Filled **hover backgrounds** on buttons **inside** that subtree are high-risk.

### 3.2 Extra compositor promotion on the masked scroller

The scroller has or had:

- `opacity-[0.99]`
- `transform-gpu`
- `will-change-transform`

Theory: those **amplify** partial repaints with **mask + scroll**. **Phase 1 removed them** — **user rejected the rollout** and reported **everything worse**, so **removing these is not validated** as safe; they may have been **masking** a different symptom or **interacting** with blur/banding in an unexpected way.

### 3.3 `transition-all` + hover background on small hit targets

`transition-all` animates **many** properties and increases repaint cost. Together with **`hover:bg-[var(--color-surface-hover)]`** on `MessageActions` buttons, the **visible “chip”** was exactly the **hover fill**, not a separate bug in Lucide icons.

### 3.4 Composer clipping

The footer is **`absolute`** with **rounded** corners and **backdrop blur**. Without **`overflow-hidden`** on that card, a **multi-line** `textarea` with **`maxHeight: 100px`** could still **paint glyphs** outside the rounded rect (especially bottom curves). The **wrapper** `max-h-[100px] overflow-hidden` constrains the **paint region**.

### 3.5 File inputs: `hidden` vs `sr-only`

Using Tailwind **`hidden`** (`display: none`) on `<input type="file">` can interact badly with **label** focus and **keyboard** behavior. **`sr-only`** keeps the input **in the accessibility tree** but off-screen, which is the usual pattern for custom file buttons.

### 3.6 Shell: assistant aside + blur plate

In `layout.tsx`, the panel lives in a **fixed** `motion.aside` with an **inset blur plate** (`backdrop-filter: blur(30px)`). That is **separate** from the chat component but adds **another** blurred layer behind the UI; banding in screenshots can include **interaction with GPU** scaling of the panel.

---

## 4. Chronology — what was tried

### 4.1 Sidebar / rail (prior session — related “glass” work, not `AssistantChatPanel`)

| Item | Notes |
|------|--------|
| **Collapsed sidebar tooltips** | Custom **`SidebarRailTooltip`** (`src/components/SidebarRailTooltip.tsx`) — portal tooltips, **rail-row** vs **compact** anchoring, **200ms** fade to match row hover. |
| **Menu tooltip removed** | Sidebar toggle **no longer** wrapped in tooltip with **`label="Menu"`** — overlap with header/breadcrumb. |
| **Tooltip surface** | Adjusted **backdrop blur** strength and **`bg-white/[0.03]`** fill to match **3%** glass baseline. |
| **Prize Pool** | Label/icon updates in **`SidebarProof`** / **`navigation.config.tsx`** — distinct from chat bugs. |

### 4.2 Chat panel — investigation (read-only)

| Finding | Detail |
|---------|--------|
| **Diagnosis** | Masked scroll + **`opacity-[0.99]`** + **GPU** hints + **hover:bg** → compositor glitches; **not** “wrong token only.” |
| **User constraint** | Did **not** want to change **fade behavior** in ways that **re-broke** composer **bottom clipping** (earlier failed attempts). |

### 4.3 Chat panel — plate overlay attempt (rejected)

| What was done | Fixed `h-10` / `h-14` **gradient plates**, **`pointer-events-none`**, removed **mask** from scroller (intent: occlusion instead of mask). |
|----------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| **Why rejected** | User reported **worse** behavior: **clipping** / **input** issues and **did not** match expectations. **Do not restore** without explicit sign-off. |
| **Lesson** | “Plates” must not alter **scroll height**, **padding**, or **textarea** structure; **`GlobalBackground`** in this repo is currently a **minimal** slate (`src/components/GlobalBackground.tsx`), not a full aurora clone — any “mirror” must match **actual** panel chrome (`rgba(255,255,255,0.02)` etc.). |

### 4.4 Chat panel — “Phase 1” bundle (REJECTED — **made things worse**)

**User feedback:** After implementing the bundle below, the user **rejected the update** and reported that it made **everything worse** (not merely “unchanged”). Treat this as a **failed experiment**, not a baseline to preserve.

| What was attempted | Intent |
|--------------------|--------|
| **`MessageActions`**: remove **`hover:bg`**, use **`transition-opacity`** + **`hover:opacity`**, **`type="button"`**, **`focus:outline-none focus-visible:ring-0`** | Stop rectangular hover fills under the mask. |
| **Messages scroller**: remove **`opacity-[0.99]`**, **`transform-gpu`**, **`will-change-transform`** | Reduce extra compositor layers on the **same** node as the mask. |
| **Footer**: **`overflow-hidden`** | Clip footer/chrome to rounded rect. |
| **Textarea**: wrapper **`min-h-0 max-h-[100px] overflow-hidden`**, **`items-start`** | Stop textarea paint escaping the card. |

**Why it may have failed (hypotheses — not excuses):**

1. **Bundled changes** — hover, scroller layers, and composer clipping were **one commit**; if any piece regressed UX, the whole thing feels “worse” with no isolation.
2. **Removing GPU/opacity hints** — may have **changed** how the masked layer composites with the **footer blur** / shell blur; can **increase** visible banding or flicker on some GPUs.
3. **Opacity-only** message actions — may read as **broken** or **washed out** compared to prior design, or **interact badly** with nested `opacity` elsewhere in the row.
4. **Footer `overflow-hidden` + textarea wrapper** — can **clip** or **scroll** sub-pixels wrong with **`backdrop-filter`**, or fight **`scrollbar-autohide`** / dynamic height.
5. **Theory ≠ device** — the “mask + hover fill” diagnosis may be **incomplete**; **shell** (`layout.tsx` blur plate, `motion`, resize layer) may dominate perceived “glitchiness.”

**Hard rule going forward:** **Do not re-apply this bundle** as a unit. Any retry must be **one variable at a time** with **explicit** user sign-off per step.

---

### 4.5 Plate overlay attempt (earlier rejection — separate from Phase 1)

Same as §4.3: gradient **plates** instead of mask — **rejected** (clipping / input feel). **Do not merge** without a new spec + QA.

---

## 5. Checklist — **suspended** until new plan

The checklist in the previous revision assumed Phase 1 was “good.” **It is not.** Do **not** treat “no hover:bg on MessageActions” or “no GPU hints on scroller” as mandatory — they are **unproven** after rejection.

---

## 6. Old “if problems return” — superseded

See **§7 New plan** below.

---

## 7. New plan (after Phase 1 failure)

**Principle:** Stop shipping **multi-change bundles**. The chat panel has **failed every bundled fix** (plates, Phase 1). Next work must be **hypothesis → single lever → measure → stop**.

### Step A — Freeze and baseline (no code, or docs only)

1. Confirm **which** file revision is “truth” after rejections (likely **pre–Phase 1** `AssistantChatPanel.tsx`).
2. **Screenshot + screen recording** checklist: message hover, footer, resize, scroll top/bottom — **one** environment (Chrome version, OS, GPU) noted in `chat-bugs.md`.

### Step B — DevTools-only proof (no merge)

1. Toggle **mask** on the message scroller **off** temporarily in DevTools: if glitches **vanish**, the mask is confirmed as a **major** variable; if not, look **shell** (`layout.tsx` aside, blur plate, z-index).
2. Toggle **`backdrop-filter`** on footer **off** temporarily: separates **banding** from **mask**.

### Step C — Single-lever trials (user approves **each** PR title)

Order is **suggested**, not mandatory:

1. **Composer clipping only** — `overflow-hidden` on footer **or** textarea wrapper **alone**; **zero** changes to message row or scroller classes. QA: no text leak, no new scroll jump.
2. **Mask scope only** — apply fade so **`MessageActions` buttons are not descendants of the masked node** (DOM restructure: mask an inner **content** wrapper, not the full scroll column). **Does not** remove fade; changes **where** the mask applies. Higher effort; addresses “interaction under mask” directly.
3. **Shell** — reduce **one** blur strength or **one** layer in `layout.tsx` assistant shell (last resort for banding); **visual sign-off** required.

### Step D — Explicitly **out of scope** until C fails

- **Portaling** tooltips/actions — only if mask relocation is impossible.
- **Re-plates** — only with written QA matching §4.3 lessons.

### Step E — Documentation

Update this file **after each** trial: **what changed**, **result**, **revert hash** / **rejected**.

---

## 8. Related files (quick reference)

| File | Role |
|------|------|
| `src/components/AssistantChatPanel.tsx` | Chat UI, `MessageActions`, scroll mask, composer. |
| `src/styles/theme.css` | `.scroll-fade-mask`, `.scroll-fade-pad`. |
| `src/app/[locale]/dashboard/layout.tsx` | Assistant **aside**, overlay, **blur** plate, **resize** handle. |
| `src/components/SidebarRailTooltip.tsx` | **Not** chat — sidebar rail labels / tooltips. |
| `src/layouts/Sidebar/SidebarProof.tsx` | **Not** chat — dashboard sidebar. |

---

## 9. Document maintenance

- **Last consolidated:** 2026-04-15 — added **§4.4 Phase 1 REJECTED**, **§7 New plan**, removed erroneous “surgical fix kept” claim; user reported Phase 1 **made everything worse** (reverted).
- **When changing** `AssistantChatPanel`, **update §4** with **what failed** and **§7** with the **next single-lever trial** — no bundled fixes without explicit approval.

---

*This file is intentionally explicit about failures. Preserving failure history prevents repeating it.*
