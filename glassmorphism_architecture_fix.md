# Glassmorphism Architectural Documentation

## The "Sync-Layered Environmental Masking" Architecture

### 🧩 The Root Technical Conflict
In Chromium-based engines, applying a `-webkit-mask-image` to a parent container (like your dashboard's scroller) forces that container to create a **flattened offscreen buffer**. This buffer **isolates** the children from any pixels outside the scroller's layer context. 

Consequently, any card inside the scroller attempting to use `backdrop-filter: blur(...)` finds that there are **zero pixels behind its layer** to sample, causing the blur to fail silently or render a solid gray/white background.

### 🏗️ The Decoupled Solution

| Component | Implementation | Result |
| :--- | :--- | :--- |
| **Environmental Context** | Refactored `GlobalBackground` into a reusable, sync-aware component. | Provides a consistent "pixel-map" for the entire app. |
| **Scroller Container** | Removed all `-webkit-mask-image` properties from `main-content-scroll`. | **Restores 100% functionality to the `backdrop-filter`** on any child card. |
| **Atmospheric Plates** | Two **Fixed Overlays** at the top (`h-10`) and bottom (`h-14`) at `z-[2]`. | These plates handle the **visual fade** and **bleed protection** by occlusion. |

### 🔍 How the "Plates" Work (The Seamless Illusion)
Instead of using a transparent mask that "pokes holes" in the scroller (which kills child blurs), we used **Atmospheric Occlusion**:
1.  **Mirrored Layers:** These fixed overlays **re-render** the `GlobalBackground` (Aurora + Grid + Texture) inside their own tiny containers.
2.  **Synced Animation:** Use the same high-resolution timer (`performance.now()`) for Aurora, ensuring the overlays match the background pixels perfectly.
3.  **The Illusion:** As cards scroll up under the top plate, the plate renders the **Aurora background on top of the card**. Because this second Aurora matches the background Aurora, the content appears to fade out into the atmosphere.
4.  **No Layer Flattening:** Since the scroller itself is now "unmasked," the GPU is free to calculate the `backdrop-filter` sample on every child card against the base Aurora layer.

### 💎 Design Token Adherence
- **No White Tints:** No `bg-white/5%` cheats or opaque background overrides. All cards sample the true background.
- **Bleed Protection:** The top plate is `h-10`, effectively erasing any content that enters the 16px gap above your toolbar.
- **Rich Texture Parity:** The implementation preserves your premium HSL-curated colors and dynamic patterns.

**The architecture is now decoupled: the scroller moves the content, while the Atmospheric Plates handle the depth perception and fading in sync with your global design language.**
