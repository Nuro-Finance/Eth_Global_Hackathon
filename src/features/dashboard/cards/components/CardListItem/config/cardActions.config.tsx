/**
 * Card Actions Configuration
 * Mock data structure matching API response
 */

export interface CardActionItem {
  id: string;
  actionType: "lock" | "unlock" | "transactions" | "report" | "withdraw" | "settings";
  variant?: "default" | "danger";
}

/**
 * Mock card actions data - Replace with API response
 */
export const MOCK_CARD_ACTIONS: CardActionItem[] = [
  {
    id: "transactions",
    actionType: "transactions",
  },
  {
    id: "withdraw",
    actionType: "withdraw",
  },
  {
    id: "lock",
    actionType: "lock",
  },
  {
    id: "report",
    actionType: "report",
  },
];

