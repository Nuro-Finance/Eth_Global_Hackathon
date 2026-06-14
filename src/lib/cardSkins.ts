/** Noir card face - CTA blob uses primary→accent lavender, not this literal gradient */
export const MY_CARD_NOIR_GRADIENT =
  "linear-gradient(135deg, #1a1a1a 0%, #333333 100%)";

/** White / pearl swatch - must match Card Settings */
export const MY_CARD_WHITE_SKIN_GRADIENT =
  "linear-gradient(135deg, #ffffff 0%, #e8eef5 100%)";

/**
 * CTA panel corner blob when white skin is selected - cool lavender (same family as default
 * blob), not the card’s white gradient, so the glow never flashes bright white.
 */
export const MY_CARD_WHITE_BLOB_GRADIENT =
  "linear-gradient(60deg, rgba(175, 165, 220, 0.5) 0%, rgba(130, 155, 235, 0.38) 100%)";

/** Agency card: white skin uses normal composite (not mix-blend-color) at this opacity */
export const AGENCY_WHITE_SKIN_OVERLAY_OPACITY = 0.1;

export const NURO_CARD_FACE_ASSETS = {
  black: "/cards/nuro-card-black.png",
  blue: "/cards/nuro-card-blue.png",
  green: "/cards/nuro-card-green.png",
  purple: "/cards/nuro-card-purple.png",
  white: "/cards/nuro-card-white.png",
} as const;

// Bump this to force browsers to fetch updated card face assets.
const CARD_FACE_ASSET_VERSION = "20260326-01";

export type NuroCardFaceId = keyof typeof NURO_CARD_FACE_ASSETS;

export function isNoirCardSkinGradient(gradient: string | undefined): boolean {
  const g = gradient?.trim() ?? "";
  if (g === "" || g === MY_CARD_NOIR_GRADIENT) return true;
  const u = g.toLowerCase();
  const noirStops = ["#151313", "#0f0f0f", "#1a1a1a", "#333333", "#6a6a6a"];
  const colorStops = [
    "#1e3a8a",
    "#3b82f6",
    "#064e3b",
    "#10b981",
    "#4c1d95",
    "#8b5cf6",
    "#ffffff",
  ];
  return includesAny(u, noirStops) && !includesAny(u, colorStops);
}

/** Curated My Card theme picker values (order matches Card Settings swatches). */
export const MY_CARD_THEME_SWATCHES = [
  MY_CARD_NOIR_GRADIENT,
  MY_CARD_WHITE_SKIN_GRADIENT,
  "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
  "linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)",
] as const;

/** Map API / legacy gradients to a canonical swatch so the picker selection survives refresh. */
export function resolveMyCardThemeSwatch(gradient: string | undefined): string {
  const g = gradient?.trim() ?? "";
  const exact = MY_CARD_THEME_SWATCHES.find((swatch) => swatch === g);
  if (exact) return exact;
  if (isNoirCardSkinGradient(g)) return MY_CARD_NOIR_GRADIENT;
  if (isWhiteCardSkinGradient(g)) return MY_CARD_WHITE_SKIN_GRADIENT;

  switch (resolveNuroCardFaceIdFromGradient(g)) {
    case "white":
      return MY_CARD_WHITE_SKIN_GRADIENT;
    case "blue":
      return MY_CARD_THEME_SWATCHES[2];
    case "green":
      return MY_CARD_THEME_SWATCHES[3];
    case "purple":
      return MY_CARD_THEME_SWATCHES[4];
    default:
      return MY_CARD_NOIR_GRADIENT;
  }
}

export function isWhiteCardSkinGradient(gradient: string): boolean {
  if (!gradient) return false;
  if (gradient === MY_CARD_WHITE_SKIN_GRADIENT) return true;
  const u = gradient.toLowerCase();
  if (!u.includes("#ffffff")) return false;
  const colored = [
    "#1a1a1a",
    "#333333",
    "#151313",
    "#0f0f0f",
    "#1e3a8a",
    "#3b82f6",
    "#064e3b",
    "#10b981",
    "#4c1d95",
    "#8b5cf6",
  ];
  return !colored.some((h) => u.includes(h));
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function resolveNuroCardFaceIdFromGradient(
  gradient: string | undefined
): NuroCardFaceId {
  const g = (gradient ?? "").trim();
  if (isNoirCardSkinGradient(g)) return "black";
  if (isWhiteCardSkinGradient(g)) return "white";

  const u = g.toLowerCase();
 // These hex stops match the curated “Card Theme” gradients in `CardSettings`.
  if (includesAny(u, ["#1e3a8a", "#3b82f6"])) return "blue";
  if (includesAny(u, ["#064e3b", "#10b981"])) return "green";
  if (includesAny(u, ["#4c1d95", "#8b5cf6"])) return "purple";

 // Unknown / legacy gradients fall back to the default black face.
  return "black";
}

export function resolveNuroCardFaceSrcFromGradient(
  gradient: string | undefined
): string {
  return `${NURO_CARD_FACE_ASSETS[resolveNuroCardFaceIdFromGradient(gradient)]}?v=${CARD_FACE_ASSET_VERSION}`;
}

/** Card gradient swatches for the skin picker */
export const CARD_SKINS: string[] = [
  MY_CARD_NOIR_GRADIENT,
  MY_CARD_WHITE_SKIN_GRADIENT,
  "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
  "linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)",
  "linear-gradient(135deg, #7c2d12 0%, #f97316 100%)",
  "linear-gradient(135deg, #831843 0%, #ec4899 100%)",
  "linear-gradient(135deg, #1e40af 0%, #06b6d4 100%)",
];
