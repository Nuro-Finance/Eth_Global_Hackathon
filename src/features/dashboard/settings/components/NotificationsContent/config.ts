import { Wallet, CreditCard, Bell, ArrowDownToLine, ArrowUpFromLine, AlertCircle, XCircle, TrendingUp, ShieldAlert, Mail, LayoutTemplate, Smartphone, LucideIcon } from "lucide-react";

export type NotificationKey = 
  | "depositAlerts"
  | "withdrawalAlerts"
  | "largeTransfers"
  | "cardDeclined"
  | "limitApproaching"
  | "cardStatus"
  | "marketingEmails"
  | "securityAlerts";

export interface NotificationRowConfig {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    stateKey: NotificationKey;
}

export const TRANSACTION_ROWS: NotificationRowConfig[] = [
    {
        id: "depositAlerts",
        icon: ArrowDownToLine,
        title: "Incoming Deposits",
        description: "Alert me when a USDC deposit safely lands in my vault.",
        stateKey: "depositAlerts",
    },
    {
        id: "withdrawalAlerts",
        icon: ArrowUpFromLine,
        title: "Withdrawal Confirmations",
        description: "Alert me when a withdrawal smart contract completes processing.",
        stateKey: "withdrawalAlerts",
    },
    {
        id: "largeTransfers",
        icon: AlertCircle,
        title: "Large Transfers",
        description: "Receive a special push alert for any transaction over $1,000.",
        stateKey: "largeTransfers",
    },
];

export const CARD_ROWS: NotificationRowConfig[] = [
    {
        id: "cardDeclined",
        icon: XCircle,
        title: "Card Declined",
        description: "Alert me immediately if my card is declined.",
        stateKey: "cardDeclined",
    },
    {
        id: "limitApproaching",
        icon: TrendingUp,
        title: "Limit Approaching",
        description: "Alert me when I reach 80% of my monthly withdrawal limit.",
        stateKey: "limitApproaching",
    },
    {
        id: "cardStatus",
        icon: CreditCard,
        title: "Status Changes",
        description: "Alert me if a card is frozen, un-frozen, or deleted.",
        stateKey: "cardStatus",
    },
];

export const GENERAL_ROWS: NotificationRowConfig[] = [
    {
        id: "securityAlerts",
        icon: ShieldAlert,
        title: "Account Security",
        description: "Mandatory alerts for new device logins or password changes.",
        stateKey: "securityAlerts",
    },
    {
        id: "marketingEmails",
        icon: Mail,
        title: "Newsletter & Updates",
        description: "Standard feature updates, insights, or promotional offers.",
        stateKey: "marketingEmails",
    },
];
