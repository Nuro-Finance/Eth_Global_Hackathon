/**
 * BYOK helpers shared with the sidebar chat (AssistantChatPanelV2).
 * Keys live in localStorage only; never sent except on explicit API calls.
 */

import type { ChatLlmProvider, ChatModelTier } from "./chat-provider-models";

export type ByokProvider = ChatLlmProvider;

const COMMIT_KEY = (p: ByokProvider) => `nuro.chat.byok.commit.${p}`;
const STORAGE_KEY = (p: ByokProvider) => `nuro.chat.key.${p}`;
const TIER_KEY = (p: ByokProvider) => `nuro.chat.tier.${p}`;
const MODE_KEY = "nuro.chat.mode";

export function isByokCommitted(provider: ByokProvider): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COMMIT_KEY(provider)) === "1";
}

export function getCommittedByokApiKey(provider: ByokProvider): string | null {
  if (typeof window === "undefined") return null;
  if (!isByokCommitted(provider)) return null;
  const key = window.localStorage.getItem(STORAGE_KEY(provider))?.trim();
  return key || null;
}

/** Active live provider from Nuro AI panel (`nuro.chat.mode`), else first committed key. */
export function getActiveByokProvider(): ByokProvider | null {
  if (typeof window === "undefined") return null;
  const mode = window.localStorage.getItem(MODE_KEY);
  if (mode === "openai" || mode === "anthropic" || mode === "gemini") {
    if (getCommittedByokApiKey(mode)) return mode;
  }
  for (const p of ["openai", "anthropic", "gemini"] as const) {
    if (getCommittedByokApiKey(p)) return p;
  }
  return null;
}

export function getByokTier(provider: ByokProvider): ChatModelTier {
  if (typeof window === "undefined") return "fast";
  const t = window.localStorage.getItem(TIER_KEY(provider));
  return t === "smart" ? "smart" : "fast";
}

export type CardChatRequestPayload =
  | { message: string; apiKey: string; provider: ByokProvider; tier: ChatModelTier }
  | { error: string };

/** Per-card agent chat — uses the same BYOK provider + tier as the sidebar. */
export function buildCardChatRequestBody(message: string): CardChatRequestPayload {
  const provider = getActiveByokProvider();
  if (!provider) {
    return {
      error: "Connect an API key in Nuro AI settings to chat with this card.",
    };
  }
  const apiKey = getCommittedByokApiKey(provider);
  if (!apiKey) {
    return {
      error: "Connect an API key in Nuro AI settings to chat with this card.",
    };
  }
  return {
    message,
    apiKey,
    provider,
    tier: getByokTier(provider),
  };
}
