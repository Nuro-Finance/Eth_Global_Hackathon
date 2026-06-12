import { PolymarketNavIcon } from "@/components/icons/PolymarketNavIcon";
import { NavigationItem } from "../types";
import {
  LayoutGrid,
  LayoutPanelLeft,
  TrendingUp,
  CreditCard,
  ArrowRightLeft,
  Wallet2,
  Bot,
  Award,
  Settings,
  Component,
  Home,
} from "lucide-react";

// Lucide icons with consistent sizing
const Overview2Icon = () => <LayoutGrid className="w-5 h-5" />;
const HomeIcon = () => <Home className="w-5 h-5" />;
const MyCardIcon = () => <CreditCard className="w-5 h-5" />;
const AgentCardsIcon = () => <Bot className="w-5 h-5" />;
const TransactionsIcon = () => <ArrowRightLeft className="w-5 h-5" />;
const WalletIcon = () => <Wallet2 className="w-5 h-5" />;
const YieldAgentsIcon = () => <TrendingUp className="w-5 h-5" />;
const ArenaIcon = () => <Award className="w-5 h-5" />;
const PolymarketIcon = () => (
  <PolymarketNavIcon className="!h-[25.3px] !w-[25.3px] shrink-0" />
);
const SettingsIcon = () => <Settings className="w-5 h-5" />;
const UIComponentIcon = () => <Component className="w-5 h-5" />;

export const NAVIGATION_ROUTES = {
  DASHBOARD: "/dashboard/home-responsive",
  OVERVIEW_2: "/dashboard/overview-2",
  OVERVIEW_3: "/dashboard",
  MY_CARD: "/dashboard/my-card",
  MY_CARD_1: "/dashboard/my-card-1",
  MY_CARD_V2: "/dashboard/my-card-v2",
  AGENT_CARDS: "/dashboard/agent-cards",
  TRANSACTIONS: "/dashboard/transactions",
  AGENT_WALLET: "/dashboard/agent-wallet",
  WALLET_1: "/dashboard/my-wallet",
  VAULT: "/dashboard/vault",
  YIELD_AGENTS: "/dashboard/yield-agents",
  ARENA: "/dashboard/arena",
  MARKETS: "/dashboard/markets",
  SETTINGS: "/dashboard/settings",
  UI_COMPONENTS: "/dashboard/ui-component",
} as const;

// Configuration for sidebar navigation items (without translations)
export const sidebarNavigationConfig = [
  {
    id: "overview",
    icon: <HomeIcon />,
    labelKey: "Home",
    href: NAVIGATION_ROUTES.DASHBOARD,
    tooltipKey: "Home",
  },
  {
    id: "my-card-v2",
    icon: <MyCardIcon />,
    labelKey: "My Card",
    href: NAVIGATION_ROUTES.MY_CARD_V2,
    tooltipKey: "My Card",
  },
  {
    id: "agent-cards",
    icon: <AgentCardsIcon />,
    labelKey: "Agent Cards",
    href: NAVIGATION_ROUTES.AGENT_CARDS,
    tooltipKey: "Agent Cards",
  },
  {
    id: "transactions",
    icon: <TransactionsIcon />,
    labelKey: "Transactions",
    href: NAVIGATION_ROUTES.TRANSACTIONS,
    tooltipKey: "Transactions",
  },
  {
    id: "vault",
    icon: <WalletIcon />,
    labelKey: "Bank Vault",
    href: NAVIGATION_ROUTES.VAULT,
    tooltipKey: "Bank Vault",
  },
  {
    id: "agent-wallet",
    icon: <AgentCardsIcon />,
    labelKey: "Agent Wallet",
    href: NAVIGATION_ROUTES.AGENT_WALLET,
    tooltipKey: "Agent Wallet",
  },
  {
    id: "yield-agents",
    icon: <YieldAgentsIcon />,
    labelKey: "Yield Agents",
    href: NAVIGATION_ROUTES.YIELD_AGENTS,
    tooltipKey: "Yield Agents",
  },
  {
    id: "arena",
    icon: <ArenaIcon />,
    labelKey: "Prize Pool",
    href: NAVIGATION_ROUTES.ARENA,
    tooltipKey: "Prize Pool",
  },
  {
    id: "markets",
    icon: <PolymarketIcon />,
    labelKey: "Polymarket",
    href: NAVIGATION_ROUTES.MARKETS,
    tooltipKey: "Polymarket",
  },
];

export const settingsItemConfig = {
  id: "settings",
  icon: <SettingsIcon />,
  labelKey: "Settings",
  href: NAVIGATION_ROUTES.SETTINGS,
  tooltipKey: "Settings",
};

// Sectioned nav: MAIN, CARDS, WALLET, DEMOS
// YIELD section intentionally HIDDEN since Marathon 11 demo prep — yield-agents,
// arena, markets ROUTES still exist (Chris drop 5.23.26 Phase 1 added pages) but
// must not appear in the sidebar until product is ready to surface them.
// Re-enable by putting "yield" back into SIDEBAR_SECTIONS + sidebarSectionsConfig.
export const SIDEBAR_SECTIONS = ["main", "cards", "wallet", "demos"] as const;
export type SidebarSectionId = (typeof SIDEBAR_SECTIONS)[number];

export const sidebarSectionsConfig: Record<
  SidebarSectionId,
  { label: string; itemIds: string[] }
> = {
  main: {
    label: "MAIN",
    itemIds: ["overview"],
  },
  cards: {
    label: "CARDS",
    itemIds: ["my-card-v2", "agent-cards", "transactions"],
  },
  wallet: {
    label: "WALLET",
    itemIds: ["vault", "agent-wallet"],
  },
  demos: {
    label: "DEMOS",
    itemIds: [],
  },
};

// HIDDEN section config — preserved for easy re-enable. Spread back into
// sidebarSectionsConfig + add "yield" into SIDEBAR_SECTIONS above to restore.
export const _hiddenYieldSection = {
  label: "YIELD",
  itemIds: ["yield-agents", "arena", "markets"],
};

const allNavItems = [...sidebarNavigationConfig, settingsItemConfig];
export function getNavItemById(id: string) {
  return allNavItems.find((item) => item.id === id);
}

// Legacy exports for backward compatibility
export const sidebarNavigation: NavigationItem[] = [
  {
    id: "overview",
    icon: <HomeIcon />,
    label: "Home",
    href: NAVIGATION_ROUTES.DASHBOARD,
    tooltip: "Home",
  },
  {
    id: "transactions",
    icon: <TransactionsIcon />,
    label: "Transactions",
    href: NAVIGATION_ROUTES.TRANSACTIONS,
    tooltip: "Transaction History",
  },
];
