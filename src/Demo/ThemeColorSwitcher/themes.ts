/**
 * Theme Colors Interface
 * Only includes brand-related colors that change between themes.
 * UI colors (backgrounds, borders, text) are handled by CSS light/dark mode.
 */
export interface ThemeColors {
    name: string;
    id: string;
    preview: string; // Primary color for preview

 // Brand Image Filters
    brandHueRotate: string;
    brandSaturate: string;
    brandBrightness: string;

 // Brand Colors (these change with theme)
    brandPrimary: string;
    brandPrimaryLight: string;
    brandSurface: string;
    brandBorder: string;
    brandGlow: string;
    nuroBrand: string;
    accent: string;

 // Button Colors
    buttonText: string;

 // Card accent colors (brand-related)
    cardAccent: string;
    cardAccentMuted: string;
}

// 2026-05-25 — call: hide Nuro (purple), Golden, Silver (white) until
// minor styling hiccups on those 3 non-Obsidian themes are resolved in a future
// sprint. Only Blue (Obsidian) ships visible for now. Theme definitions PRESERVED
// below as `_hiddenThemes` for trivial re-enable when fixes land — spread back
// into `themes` array in the desired order.
//
// Re-enable: replace `themes` body with the spread shown in `_hiddenThemes` plus
// the Blue entry.
export const themes: ThemeColors[] = [
    {
        name: "Blue",
        id: "blue",
        preview: "#3b82f6",

        brandHueRotate: "hue-rotate(220deg)",
        brandSaturate: "saturate(1.2)",
        brandBrightness: "brightness(1)",

        brandPrimary: "#3b82f6",
        brandPrimaryLight: "#60a5fa",
        brandSurface: "rgba(59, 130, 246, 0.1)",
        brandBorder: "rgba(59, 130, 246, 0.2)",
        brandGlow: "rgba(59, 130, 246, 0.3)",
        nuroBrand: "#846FFF",
        accent: "#93c5fd",

        buttonText: "#ffffff",

        cardAccent: "#60a5fa",
        cardAccentMuted: "#3b82f6",
    },
];

/**
 * Hidden themes — spread these back into `themes` above (in the desired display
 * order) when the styling hiccups noted on 2026-05-25 are fixed.
 */
export const _hiddenThemes: ThemeColors[] = [
    {
        name: "Nuro",
        id: "nuro",
        preview: "#846FFF",

        brandHueRotate: "hue-rotate(0deg)",
        brandSaturate: "saturate(1)",
        brandBrightness: "brightness(1)",

        brandPrimary: "#846FFF",
        brandPrimaryLight: "#9d8aff",
        brandSurface: "rgba(132, 111, 255, 0.1)",
        brandBorder: "rgba(132, 111, 255, 0.2)",
        brandGlow: "rgba(132, 111, 255, 0.3)",
        nuroBrand: "#846FFF",
        accent: "#9d8aff",

        buttonText: "#ffffff",

        cardAccent: "#9d8aff",
        cardAccentMuted: "#846FFF",
    },

    {
        name: "Golden",
        id: "golden",
        preview: "#d4a017",

        brandHueRotate: "hue-rotate(40deg)",
        brandSaturate: "saturate(1.3)",
        brandBrightness: "brightness(1)",

        brandPrimary: "#d4a017",
        brandPrimaryLight: "#f0c040",
        brandSurface: "rgba(212, 160, 23, 0.1)",
        brandBorder: "rgba(212, 160, 23, 0.2)",
        brandGlow: "rgba(212, 160, 23, 0.3)",
        nuroBrand: "#846FFF",
        accent: "#ffd700",

        buttonText: "#1a1a1a",

        cardAccent: "#f0c040",
        cardAccentMuted: "#d4a017",
    },

    {
        name: "Silver",
        id: "silver",
        preview: "#6b7280",

        brandHueRotate: "hue-rotate(0deg)",
        brandSaturate: "saturate(0)",
        brandBrightness: "brightness(1)",

        brandPrimary: "#6b7280",
        brandPrimaryLight: "#9ca3af",
        brandSurface: "rgba(107, 114, 128, 0.1)",
        brandBorder: "rgba(107, 114, 128, 0.2)",
        brandGlow: "rgba(107, 114, 128, 0.3)",
        nuroBrand: "#846FFF",
        accent: "#d1d5db",

        buttonText: "#ffffff",

        cardAccent: "#9ca3af",
        cardAccentMuted: "#6b7280",
    },
];
