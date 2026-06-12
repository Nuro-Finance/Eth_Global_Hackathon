/**
 * Per-card assistant panel ↔ same API/DB as InlineCardChat / CardAgentChat
 * (card_agent_messages). Requires session auth; POST also requires BYOK.
 */
import type { AssistantChatThreadMessage } from "@/components/chat/assistantChatDestinations";

export type CardApiChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  toolsFired?: string[];
};

export function mapCardApiMessagesToThread(
  rows: CardApiChatMessage[]
): AssistantChatThreadMessage[] {
  return rows.map((row) => ({
    id: String(row.id),
    role: row.role,
    content: row.content,
    status: "sent" as const,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }));
}

export async function fetchCardChatHistory(
  cardId: string,
  accessToken: string,
  limit = 50
): Promise<CardApiChatMessage[]> {
  const res = await fetch(`/api/cards/${cardId}/messages?limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const j = await res.json().catch(() => ({}));
  return Array.isArray(j?.messages) ? (j.messages as CardApiChatMessage[]) : [];
}
