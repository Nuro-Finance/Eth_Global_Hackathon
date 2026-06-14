/** General Nuro Intelligence copilot - default selection in panel nav. */
export const ASSISTANT_CHAT_GENERAL_ID = "general";

export function cardChatDestinationId(cardId: string): string {
  return `card:${cardId}`;
}

export function parseCardIdFromDestination(destinationId: string): string | null {
  if (!destinationId.startsWith("card:")) return null;
  return destinationId.slice(5);
}

export function isGeneralChatDestination(destinationId: string): boolean {
  return destinationId === ASSISTANT_CHAT_GENERAL_ID;
}

export type AssistantChatThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "timed_out" | "sent";
  originalText?: string;
  attempt?: number;
  timestamp?: number;
};

const GENERAL_COPILOT_INTRO =
  "This is your copilot chat. Ask anything about your cards, transactions, yield strategies and more.";

function cardIntroContent(cardName: string, live: boolean): string {
  if (live) {
    return `Card chat for ${cardName}. Ask about spending, limits, and activity for this card.`;
  }
  return `Demo card chat for ${cardName}. Ask about spending, limits, and activity for this card.`;
}

export function buildCardThreadIntroMessages(
  cardId: string,
  cardName: string,
  live: boolean
): AssistantChatThreadMessage[] {
  return [
    {
      id: `card-intro-${cardId}`,
      role: "assistant",
      status: "sent",
      content: cardIntroContent(cardName, live),
      timestamp: Date.now(),
    },
  ];
}
