# Demo Components

This folder contains **demo-only** components used to showcase template features.

⚠️ **FOR PRODUCTION:** Delete this entire `Demo` folder.

## What's Inside

### ThemeColorSwitcher

A floating panel that allows switching between color themes and toggling performance mode.

**To remove for production:**

1. Delete this `Demo` folder
2. In `src/app/[locale]/providers.tsx`:
   - Remove the import: `import { ThemeColorProvider, ThemeColorSwitcher } from "@/Demo/ThemeColorSwitcher";`
   - Remove `<ThemeColorSwitcher />` component
   - Remove `<ThemeColorProvider>` wrapper (or keep it if you want dynamic theming)
3. Set your theme colors directly in `src/styles/theme.css`

## localStorage Keys Used (Demo Only)

- `template-theme-color` - Stores selected theme ID
- `template-performance-mode` - Stores performance mode ("on" or "off")

These keys are checked by:

- `src/components/LightRays.tsx` - Disables particles/animations when performance mode is "on"

For production, you can remove these localStorage checks and set values directly.
