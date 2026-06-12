# Nuro Finance: Auth Stabilization & Design-Mode Architecture

This document outlines the **High-Fidelity Stabilization** strategy implemented for the Nuro Dashbaord (Kernel 28), focusing on zero-latency development and cinematic UI orchestration.

---

## 1. The "Design Mode" One-Switch Architecture
To solve the "Backend Timeout" delay during local UI development, we implemented a **Selective Design Shunt**.

- **Toggle**: `NEXT_PUBLIC_DESIGN_MODE=true` in `.env.local`.
- **Targeting**: [`.env.local`](file:///Users/cjb369/Desktop/Nuro%20Finance%20Dashboard%203.30.26/Cashly-frontend/.env.local) is in `.gitignore`, ensuring these bypasses never reach the production track.
- **Selective Bypass**:
    - **Sign In**: 0ms immediate bypass (instant dashboard access).
    - **Create Account / OTP**: **LIVE UX Flow** (simulated delays preserved for UX auditing and polishing).

---

## 2. The Animation Orchestrator (High-Fidelity Cascade)
We have implemented a **Sequential Content Cascade** that matches the premium "hand-feel" of the Dashboard's Reload flow.

### Transition Math:
- **Curve**: `cubic-bezier([0.33, 1, 0.68, 1])` for a heavy, luxury landing feel.
- **Stagger**: `0.08s` delay between child elements.
- **Micro-Slide**: `12px` vertical lift from `0% opacity`.

### Component Stagger Sequence:
1. **Logo / Header**: 0.00s
2. **Inputs**: 0.08s
3. **Remember Me / Social Logins**: 0.16s
4. **Primary Submit**: 0.24s

---

## 3. Dynamic Modal Flex Stability
To eliminate "Jitter" and "Frame Drifting" during page-flips, we implemented a **Strict Height Mapping** strategy within `cardVariants`.

| State | Modal Height | Transition Duration |
| :--- | :--- | :--- |
| **Sign In** | `624px` | 600ms |
| **Reset Password** | `528px` | 600ms |
| **Success Summary** | `528px` | 600ms |

- **Structural Ghosts**: We use invisible "ghost" elements to freeze the layout dimensions during transitions, ensuring absolute positioning of the action buttons across every view.

---

## 4. Atmospheric Speed & Hydration
The environment is optimized for **Instant Page Boots** (Turbopack) through redundant context elimination.

- **One-Context Grounding**: `GlobalBackground` is set to `minimal={true}` in the Root Layout to prevent **WebGL/SVG Stacking**. The high-fidelity Aurora context is only initialized once in the Dashboard layer.
- **Hydration Shields**: All Radix UI and NextAuth components use a `mounted` state guard to prevent "ID Mismatch" crashes during high-speed local reloads.

---

**Architecture Status: STABILIZED & LOCKED.**
