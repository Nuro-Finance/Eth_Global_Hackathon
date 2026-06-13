import emojiKeywords from "./emoji-keywords.json";

const KEYWORDS = emojiKeywords as Record<string, string[]>;

export function searchEmojis(query: string, pool: string[]): string[] {
  const raw = query.trim();
  if (!raw) return pool;

  const q = raw.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  return pool.filter((emoji) => {
    if (emoji.includes(raw)) return true;

    const keywords = KEYWORDS[emoji];
    if (!keywords?.length) return false;

    return terms.every((term) =>
      keywords.some((keyword) => {
        const normalized = keyword.toLowerCase().replace(/_/g, " ");
        return normalized.includes(term) || keyword.toLowerCase().includes(term);
      }),
    );
  });
}
