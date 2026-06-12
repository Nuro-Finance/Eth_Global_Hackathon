/** Model IDs for BYOK chat — sidebar `/api/chat` and per-card agent chat. */

export type ChatModelTier = "fast" | "smart";

export type ChatLlmProvider = "openai" | "anthropic" | "gemini";

export const CHAT_PROVIDER_MODELS: Record<
  ChatLlmProvider,
  Record<ChatModelTier, string>
> = {
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    smart: process.env.CARD_AGENT_MODEL || "claude-sonnet-4-5",
  },
  openai: {
    fast: "gpt-4o-mini",
    smart: "gpt-4o",
  },
  gemini: {
    fast: "gemini-2.5-flash",
    smart: "gemini-2.5-pro",
  },
};

export function resolveChatModel(provider: ChatLlmProvider, tier: ChatModelTier): string {
  return CHAT_PROVIDER_MODELS[provider][tier];
}
