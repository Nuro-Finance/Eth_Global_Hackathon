/** World Developer Portal action — must match the action created in the portal. */
export const WORLD_RELOAD_ACTION =
  process.env.NEXT_PUBLIC_WORLD_ACTION?.trim() || "nuro-reload-verify";

export const WORLD_APP_ID = process.env.NEXT_PUBLIC_APP_ID?.trim() ?? "";

export const isWorldIdConfigured = () => Boolean(WORLD_APP_ID);

export const worldReloadSessionKey = (signal: string) =>
  `nuro-world-reload:${WORLD_RELOAD_ACTION}:${signal}`;
