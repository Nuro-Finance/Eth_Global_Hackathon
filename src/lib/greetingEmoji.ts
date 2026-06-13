const STORAGE_PREFIX = "nuro:greeting-emoji:";
export const DEFAULT_GREETING_EMOJI = "👋";

export function greetingEmojiStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readGreetingEmoji(userId: string | undefined): string {
  if (!userId || typeof window === "undefined") return DEFAULT_GREETING_EMOJI;
  return window.localStorage.getItem(greetingEmojiStorageKey(userId)) ?? DEFAULT_GREETING_EMOJI;
}

export function writeGreetingEmoji(userId: string, emoji: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(greetingEmojiStorageKey(userId), emoji);
}
