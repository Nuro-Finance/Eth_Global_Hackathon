"use client";

import { createPortal, flushSync } from "react-dom";
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefCallback,
} from "react";
import { cn } from "@/lib/utils";
import { HeroCashFlowPanel } from "../../components/HeroCashFlowPanel";
import { DemoSurfaceRegion } from "../../components/DemoSurfaceShell";
import { HeroKycFinishButton } from "../../components/HeroKycFinishButton";
import { NewUserOnboardingSteps } from "../../components/NewUserOnboardingSteps";
import { useKycStartFlow } from "../../hooks/useKycStartFlow";
import {
  WidgetCard,
  type WidgetCardProps,
  WIDGET_HEADER_TITLE_SUBTITLE_GAP_CLASS,
  OVERVIEW_HEADER_PILL_BUTTON_CLASSNAME,
} from "../../shared";
import {
  MY_CARD_NOIR_GRADIENT,
  resolveNuroCardFaceSrcFromGradient,
} from "@/lib/cardSkins";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  DndContext,
  MeasuringFrequency,
  MeasuringStrategy,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  defaultAnimateLayoutChanges,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDragSensors } from "@/components/DraggableStatCards/hooks/useDragSensors";
import {
  useAccountBalance,
  getDesignMockCardFrontOverlay,
  type PrimaryCardSensitiveFields,
} from "../../components/CardSection/AccountInfo/hooks/useAccountBalance";
import { ActionButtons } from "../../components/CardSection/AccountInfo/components/ActionButtons";
import { SegmentedBarSparkline } from "@/features/dashboard/shared/SegmentedBarSparkline";
import { Eye, EyeOff, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
} from "@/lib/walletGlassMenu";
import { UpgradeModal } from "@/features/dashboard/settings/components/SubscriptionContent/components/UpgradeModal";
import { CardSpendingLimitsModal } from "../../components/CardSpendingLimitsModal";
import {
  TOP_LAYOUT2_HERO_ORDER_KEY,
  TOP_ROW_ORDER_STORAGE_KEY,
  type TopHeroSmallSlotId,
  type TopLayout2HeroId,
  type TopVariant2CardId,
  formatUsd,
  formatUsdCompact,
  isTopLayout2HeroId,
  isTopVariant2CardId,
  loadLayout2HeroOrder,
  loadTopVariant2Order,
  pinDeckLast,
  pinDeckLastLayout2,
} from "./overviewVariantUtils";
import { useTranslations } from "next-intl";
import { MOCK_CARDS } from "@/config/mock-data";
import { NuroCodeCard } from "@/components/NuroCodeCard";
import { DEMO_USER_FULL_NAME, DEMO_USER_SHORT_NAME } from "@/config/demo-user";
import { useAppSession } from "@/hooks/useAppSession";
import { useDesignSampleDataActive } from "../../hooks/designSampleData";
import { TransactionsModal } from "@/features/dashboard/cards/components/TransactionsModal";
import { ReloadModal } from "@/features/dashboard/cards/components/ReloadModal";
import { WithdrawModal } from "@/features/dashboard/cards/components/WithdrawModal";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";
import { TransactionDetailModal } from "@/features/dashboard/transactions";
import { useDashboardDateRange } from "../DashboardGrid/context/DashboardDateRangeContext";
import { useDashboardRefreshOptional } from "../DashboardGrid/context/DashboardRefreshContext";
import { WalletSkeletonText } from "@/features/dashboard/my-wallet/WalletDataSkeletons";
import {
  isDeckCtaRole,
  DECK_SLOT_EMPTY_ID,
  PRIMARY_DECK_C1_FACE_SRC,
  PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
  usePrimaryDeckStack,
  type PrimaryDeckItem,
} from "../DashboardGrid/context/PrimaryDeckStackContext";

const variant2TopCardAnimateLayoutChanges = (
  args: Parameters<typeof defaultAnimateLayoutChanges>[0]
) => {
  if (args.wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

/** In-place hero amount skeleton — same glyph box as live USD (no layout shift). */
function HeroBalanceAmount({
  busy,
  children,
  className,
}: {
  busy: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (busy) {
    return (
      <span role="status" aria-label="Loading balance" className={cn("block w-full shrink-0", className)}>
        <WalletSkeletonText
          className={cn("font-semibold tabular-nums leading-none tracking-tight text-white", className)}
        >
          {children}
        </WalletSkeletonText>
      </span>
    );
  }
  return (
    <div className={cn("font-semibold tabular-nums leading-none tracking-tight text-white", className)}>
      {children}
    </div>
  );
}

const HERO_SLIM_WIDGET_HEADER_TITLE_PROPS = {
  className:
    "[&_h3]:min-w-0 [&_h3]:max-w-full [&_h3]:flex-nowrap [&_h3]:overflow-hidden [&_p]:truncate [&_p]:whitespace-nowrap",
} as const;

/**
 * Squeeze only when primary card is square (no tilt, below 1024 — matches CardStack) or narrow desktop 1280–1399.
 * 1024–1279: full titles + original amount sizes while card stays tilted.
 */
function HeroSlimWidgetTitle({
  longLabel,
  shortLabel,
  forceShort,
}: {
  longLabel: string;
  shortLabel: string;
  /** sm KPI pair: always show short truncated label */
  forceShort?: boolean;
}) {
  if (forceShort) {
    return (
      <span className="block min-w-0 max-w-full truncate">{shortLabel}</span>
    );
  }
  return (
    <span className="block min-w-0 max-w-full truncate">
      <span className="inline min-[768px]:max-[1023px]:hidden min-[1280px]:max-[1399px]:hidden">
        {longLabel}
      </span>
      <span className="hidden min-[768px]:max-[1023px]:inline min-[1280px]:max-[1399px]:inline">
        {shortLabel}
      </span>
    </span>
  );
}

/** md1: 15px; md2: 20px; md3+: default; narrow xl: 17px */
const HERO_SLIM_BALANCE_AMOUNT_CLASS =
  "w-full min-w-0 max-w-full shrink-0 text-[24px] sm:text-[28px] min-[768px]:max-[959px]:!text-[15px] min-[960px]:max-[1023px]:!text-[20px] min-[1280px]:max-[1399px]:!text-[17px]";

/** sm home-responsive: two-up Cards + Wallets under primary card */
const HERO_SM_KPI_AMOUNT_CLASS =
  "w-full min-w-0 max-w-full shrink-0 text-[17px] tabular-nums";

const HERO_SM_KPI_HEADER_TITLE_PROPS = {
  className:
    "[&_h3]:min-w-0 [&_h3]:max-w-full [&_h3]:text-[14px] [&_h3]:flex-nowrap [&_h3]:overflow-hidden [&_p]:hidden",
} as const;

function SpendingDonut({
  data,
  centerTop,
  centerBottom,
}: {
  data: { name: string; value: number; color: string }[];
  centerTop: string;
  centerBottom: string;
}) {
  return (
    <div className="relative h-[150px] w-[150px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            startAngle={90}
            endAngle={450}
            paddingAngle={-8}
            stroke="none"
            cornerRadius={18}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={`${d.name}-${i}`} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[10px] font-medium text-[var(--color-text-muted)]">{centerTop}</div>
        <div className="mt-1 text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          {centerBottom}
        </div>
      </div>
    </div>
  );
}

function Variant2TopSortableShell({
  id,
  children,
  heroSlot,
  slimFlat = false,
  slimAutoHeight = false,
  shellCallbackRef,
  shellStyle,
  shellClassName,
  deckAutoHeight = false,
  disabled = false,
}: {
  id: TopVariant2CardId;
  children: ReactElement<WidgetCardProps>;
  /** Deck column only: **`xl:col-span-4`** — unchanged vs flat three-col hero. Slim tiles live inside `xl:col-span-8` / `grid-cols-3`. */
  heroSlot: "slim" | "deck";
  /** Layout 2: each slim tile is its own **`xl:col-span-4`** column (flat 12-col row). */
  slimFlat?: boolean;
  slimAutoHeight?: boolean;
  /** Layout 3: measure deck column shell height without changing grid markup. */
  shellCallbackRef?: RefCallback<HTMLDivElement | null>;
  /** Layout 3: painted stack height from deck shell — slim shells + deck shell (see layout effect memos). */
  shellStyle?: CSSProperties;
  shellClassName?: string;
  /** Home-responsive xl: deck shell shrink-wraps to painted stack (no h-full stretch). */
  deckAutoHeight?: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      animateLayoutChanges: variant2TopCardAnimateLayoutChanges,
      disabled,
    });

  const mergedShellRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      shellCallbackRef?.(node);
    },
    [setNodeRef, shellCallbackRef],
  );

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...shellStyle,
  };

  const slimShrinkWrap = heroSlot === "slim" && !slimFlat && slimAutoHeight;

  const shellClass = cn(
    "min-w-0 w-full",
    heroSlot === "deck" && deckAutoHeight
      ? "h-auto min-h-0 self-start overflow-hidden"
      : heroSlot === "deck" || !slimShrinkWrap
        ? "h-full"
        : "h-auto min-h-0 self-start",
    heroSlot === "deck" ? "xl:col-span-4" : slimFlat ? "xl:col-span-4" : "",
    shellClassName,
  );

  const childHeightClass =
    heroSlot === "deck" && deckAutoHeight
      ? "[&>div]:!h-auto [&>div]:min-h-0 [&>div]:overflow-hidden"
      : heroSlot === "deck" || !slimShrinkWrap
        ? "[&>div]:h-full"
        : "[&>div]:!h-auto [&>div]:min-h-0";

  if (isDragging) {
    return (
      <div ref={mergedShellRef} style={style} {...attributes} className={shellClass} aria-hidden>
        <div className="pointer-events-none h-full min-h-0 select-none opacity-0">{children}</div>
      </div>
    );
  }

  const cardWithHeadDrag = disabled
    ? children
    : cloneElement(children, {
        dragHandleRef: setActivatorNodeRef,
        dragHandleProps: {
          ...listeners,
        },
        isDraggable: true,
      } satisfies Partial<WidgetCardProps>);

  return (
    <div ref={mergedShellRef} style={style} {...attributes} className={cn(shellClass, childHeightClass)}>
      {cardWithHeadDrag}
    </div>
  );
}

/** Primary card deck: flowing tier motion (y + scale); layout classes unchanged inside stable motion wrappers */
const DECK_CTA_UPGRADE_BUTTON_CLASSNAME =
  "relative inline-flex max-w-[min(100%,15rem)] shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-cta-button-bg)] px-3 py-2 text-center text-[11px] font-bold text-white shadow-[0_0_20px_-4px_var(--color-cta-button-glow)] transition-all hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-cta-button-bg)]/40 sm:text-xs";

const PRIMARY_DECK_MAX_DRAG = 300;
const PRIMARY_DECK_COMMIT = 0.18;
const PRIMARY_DECK_LIFT = 72;
const PRIMARY_DECK_REST_Y: [number, number, number, number] = [0, 7, 14, 21];

/**
 * Back tiers translate below the front card’s aspect box (`overflow: visible` only paints — it does not grow layout).
 * Reserve this much space below the 158:100 frame so the hero row matches the full painted stack (purple tier bottom).
 */
const PRIMARY_DECK_STACK_LAYOUT_EXTRA_BELOW_PX = Math.max(
  PRIMARY_DECK_REST_Y[0],
  PRIMARY_DECK_REST_Y[1],
  PRIMARY_DECK_REST_Y[2],
  PRIMARY_DECK_REST_Y[3],
);

/**
 * Layout 3 expand: shorten the 158:100 **layout window** only; add the same amount to the
 * below-reserve so overall stack **in-flow height** is unchanged (quick actions / grid sync stay put).
 */
const PRIMARY_DECK_EXPAND_ASPECT_WINDOW_SHRINK_PX = 7;

/** Home-responsive xl SVG: peek zone below front card frame (prod expand reserve). */
const NURO_SVG_STACK_PEEK_RESERVE_PX =
  PRIMARY_DECK_STACK_LAYOUT_EXTRA_BELOW_PX + PRIMARY_DECK_EXPAND_ASPECT_WINDOW_SHRINK_PX;

/** sm pass B: Reload/Withdraw exactly 16px below lowest painted deck tier (measured in HomeSmPrimaryCardTop). */
const SM_DECK_TO_ACTIONS_GAP_PX = 16;

/** Layout 3 hero band: always 16px between blocks (not `gap-4` / viewport-driven grid rows). */
const LAYOUT3_HERO_GUTTER_CLASS = "gap-[16px]";

/** Tier absolute scale factors */
const PRIMARY_DECK_SCALE_MID = 82 / 92;
const PRIMARY_DECK_SCALE_BACK = 72 / 92;
const PRIMARY_DECK_SCALE_T4 = 62 / 92;
const PRIMARY_DECK_CARD_CLIP_CLASS = "overflow-hidden rounded-[22px]";

/** Rest-state dim scrim on peeking tiers: card 2 lighter, card 3 darker so they don’t blend. */
const PRIMARY_DECK_PEEK_SCRIM_CLASS: Record<1 | 2, string> = {
  1: "bg-black/12",
  2: "bg-black/28",
};

/** Linear 0->1 tether to finger progress (smoothstep hid motion until mid-gesture -> “waiting” tiers). */
function clamp01Deck(p: number): number {
  if (Number.isNaN(p) || p <= 0) return 0;
  if (p >= 1) return 1;
  return p;
}

function primaryDeckLayerY(slot: 0 | 1 | 2 | 3, intent: "next" | "prev", swipeP: number): number {
  const u = clamp01Deck(swipeP);
  const [, y1, y2, y3] = PRIMARY_DECK_REST_Y;

  if (intent === "next") {
    if (slot === 0) return -PRIMARY_DECK_LIFT * u;
    if (slot === 1) return y1 * (1 - u);
    if (slot === 2) return y2 + (y1 - y2) * u;
    return y3 + (y2 - y3) * u;
  }
  if (slot === 0) return PRIMARY_DECK_LIFT * u * 0.85;
  if (slot === 1) return y1;
  if (slot === 2) return y2;
  return y3;
}

function primaryDeckLayerScale(slot: 0 | 1 | 2 | 3, intent: "next" | "prev", swipeP: number): number {
  const u = clamp01Deck(swipeP);
  const s0 = 1;
  const s1 = PRIMARY_DECK_SCALE_MID;
  const s2 = PRIMARY_DECK_SCALE_BACK;
  const s3 = PRIMARY_DECK_SCALE_T4;

  if (intent === "next") {
    if (slot === 0) return s0;
    if (slot === 1) return s1 + (s0 - s1) * u;
    if (slot === 2) return s2 + (s1 - s2) * u;
    return s3 + (s2 - s3) * u;
  }
  if (slot === 0) return s0;
  if (slot === 1) return s1;
  if (slot === 2) return s2;
  return s3;
}

function primaryDeckFrontOpacity(intent: "next" | "prev", swipeP: number): number {
  const u = clamp01Deck(swipeP);
  if (intent === "next") return Math.max(0, 1 - u);
  return 1;
}

function primaryDeckTierOpacity(intent: "next" | "prev", slot: 1 | 2 | 3, swipeP: number): number {
  if (slot === 3) {
    if (intent === "next") return clamp01Deck(swipeP);
    return 0;
  }
  return 1;
}

type PrimaryDeckQuickActions = {
  activityModalOpen: boolean;
  setActivityModalOpen: (open: boolean) => void;
  reloadModalOpen: boolean;
  setReloadModalOpen: (open: boolean) => void;
  withdrawModalOpen: boolean;
  setWithdrawModalOpen: (open: boolean) => void;
  deckActionsEnabled: boolean;
};

function usePrimaryDeckQuickActions(newUserPrimaryCardCta: boolean): PrimaryDeckQuickActions {
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [reloadModalOpen, setReloadModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const { cardActivated } = useKycStartFlow();
  const deckActionsEnabled = !newUserPrimaryCardCta || cardActivated;

  return {
    activityModalOpen,
    setActivityModalOpen,
    reloadModalOpen,
    setReloadModalOpen,
    withdrawModalOpen,
    setWithdrawModalOpen,
    deckActionsEnabled,
  };
}

function Layout3DeckQuickActionsBar({
  deckActionsEnabled,
  onReload,
  onWithdraw,
  onActivity,
}: {
  deckActionsEnabled: boolean;
  onReload: () => void;
  onWithdraw: () => void;
  onActivity: () => void;
}) {
  return (
    <div
      className={cn(
        "relative z-20 box-border flex min-h-20 w-full shrink-0 flex-col px-4 py-4 sm:px-6 sm:py-5",
        "overflow-hidden rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]",
        "border-0 ring-0 outline-none",
        "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner",
      )}
    >
      <div className="grid min-h-11 w-full min-w-0 grid-cols-3 gap-2 sm:gap-3">
        {(["Reload", "Withdraw", "Activity"] as const).map((label) => (
          <button
            key={label}
            type="button"
            disabled={!deckActionsEnabled}
            onClick={
              !deckActionsEnabled
                ? undefined
                : label === "Activity"
                  ? onActivity
                  : label === "Reload"
                    ? onReload
                    : label === "Withdraw"
                      ? onWithdraw
                      : undefined
            }
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center rounded-[12px] border border-transparent px-1",
              "text-center text-[11px] font-medium leading-none sm:text-[12px]",
              "outline-none focus-visible:ring-2 focus-visible:ring-white/35",
              deckActionsEnabled
                ? "bg-white/[0.03] text-white transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:text-white"
                : "cursor-not-allowed bg-white/[0.02] text-white/25",
            )}
          >
            <span className="min-w-0 truncate">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function VariantPrimaryDeckStack({
  deck,
  onRotate,
  hookUsdBalance,
  hookSensitive,
  hookOverlayLoading,
  /** Multiply tier widths (72% / 82% / 92%) together when not using `expandToCell`. */
  tierWidthBoost = 1,
  /**
   * Maximize the stack inside the widget cell: proportional tier widths vs front at 100%,
   * centered vertically/horizontally via container-query sizing (158:100 card aspect).
   */
  expandToCell = false,
  /** New-user preview: front card shows activate CTA instead of balance/PAN overlay. */
  newUserPrimaryCardCta = false,
  sharedReloadModal,
  /** Layout 3 hero: quick-actions bar renders in grid row 3 beside Cash Flow (not under card). */
  suppressQuickActionsBar = false,
  /** Pass B sm only: larger balance, holder name above balance, expiry/CVV match PAN size. */
  smCardFace = false,
  cardHolderLine,
  /** Responsive sm home: SVG NuroCodeCard face instead of PNG + HTML overlay. */
  nuroCodeCardFace = false,
  /** Home-responsive xl: SVG stack clipped inside deck widget only. */
  nuroCodeCardStack = false,
  /** Home-responsive xl: hero-band H (px); until set, measure root bootstraps intrinsic height. */
  svgDeckPaintHeightPx = null,
  deckQuickActions: deckQuickActionsProp,
}: {
  deck: PrimaryDeckItem[];
  onRotate: (delta: 1 | -1) => void;
  /** Fallback when deck front has no design mock overlay (live API totals + PAN strip) */
  hookUsdBalance: number;
  hookSensitive: PrimaryCardSensitiveFields | null;
  /** True while `useAccountBalance` is loading and no per-card mock applies */
  hookOverlayLoading: boolean;
  tierWidthBoost?: number;
  expandToCell?: boolean;
  newUserPrimaryCardCta?: boolean;
  sharedReloadModal?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  suppressQuickActionsBar?: boolean;
  smCardFace?: boolean;
  cardHolderLine?: string;
  nuroCodeCardFace?: boolean;
  nuroCodeCardStack?: boolean;
  svgDeckPaintHeightPx?: number | null;
  deckQuickActions?: PrimaryDeckQuickActions;
}) {
  const useSvgTier = (isFront: boolean) =>
    nuroCodeCardStack || (isFront && nuroCodeCardFace);
  const internalQuickActions = usePrimaryDeckQuickActions(newUserPrimaryCardCta);
  const deckQuickActions = deckQuickActionsProp ?? internalQuickActions;
  const {
    activityModalOpen,
    setActivityModalOpen,
    reloadModalOpen: localReloadModalOpen,
    setReloadModalOpen: setLocalReloadModalOpen,
    withdrawModalOpen,
    setWithdrawModalOpen,
    deckActionsEnabled,
  } = deckQuickActions;
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const reloadModalOpen = sharedReloadModal?.open ?? localReloadModalOpen;
  const setReloadModalOpen = sharedReloadModal?.onOpenChange ?? setLocalReloadModalOpen;
  const { startKyc, starting: kycStarting, cardActivated } = useKycStartFlow();
  const { dateRange } = useDashboardDateRange();
  const tTx = useTranslations("Transactions");
  const tDash = useTranslations("Dashboard");
  const {
    transactions: ledgerTransactions,
    isLoading: activityTransactionsLoading,
    handleTransactionSelect,
    selectedTransaction,
    closeTransactionDetail,
    isTransactionDetailOpen,
  } = useTransactionsState({
    t: tTx,
    externalDateRange: dateRange,
  });
  const frontId = deck[0]?.id ?? "";
  const cardTransactionsForDeck = useMemo(
    () => ledgerTransactions.filter((tx) => tx.cardId === frontId),
    [ledgerTransactions, frontId],
  );
  const activityModalTitle = useMemo(() => {
    const row = MOCK_CARDS.find((c) => c.id === frontId);
    const label = row?.cardName ?? row?.cardType ?? "Card";
    return `${label} - ${tTx("title")}`;
  }, [frontId, tTx]);
  const mockFront = useMemo(() => getDesignMockCardFrontOverlay(frontId), [frontId]);
  const overlayUsdBalance = mockFront?.balance ?? hookUsdBalance;
  const overlaySensitive = mockFront?.sensitive ?? hookSensitive;
  const overlayBalanceLoading = hookOverlayLoading && mockFront === null;
  const overlaySensitiveLoading = hookOverlayLoading && mockFront === null;

  const nextSlot = deck[1];
  const mockNext = useMemo(() => {
    if (!nextSlot || isDeckCtaRole(nextSlot.role)) return null;
    return getDesignMockCardFrontOverlay(nextSlot.id);
  }, [nextSlot]);
  const nextUsdBalance = mockNext?.balance ?? hookUsdBalance;
  const nextSensitive = mockNext?.sensitive ?? hookSensitive;
  const nextBalanceLoading = hookOverlayLoading && mockNext === null;
  const nextSensitiveLoading = hookOverlayLoading && mockNext === null;

  useEffect(() => {
    setSensitiveRevealed(false);
  }, [frontId]);

  const swipePv = useMotionValue(0);
  /** 0 = next · 1 = prev — numeric so `useTransform`[] types align in Framer */
  const intentCodeMv = useMotionValue(0);

  /** Stop in-flight tween so motion values cannot desync vs deck order */
  const swipeTweenRef = useRef<ReturnType<typeof animate> | null>(null);

  const prevPanMaskedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const pm = overlaySensitive?.panMasked;
    const prev = prevPanMaskedRef.current;
    if (prev !== undefined && pm !== undefined && prev !== pm) {
      setSensitiveRevealed(false);
    }
    prevPanMaskedRef.current = pm;
  }, [overlaySensitive?.panMasked]);

  const animRef = useRef(false);
  const dragRef = useRef(false);
  const movedRef = useRef(false);
  const startYRef = useRef(0);
  const gestureRef = useRef<null | "next" | "prev">(null);
  const pidRef = useRef<number | null>(null);
  /** Framer `animate` completion can fire in a microtask before sibling subtrees finish mounting; defer parent setState. */
  const mountedRef = useRef(false);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const unpackIntent = (code: number): "next" | "prev" => (code >= 1 ? "prev" : "next");

  useEffect(() => {
    return () => {
      swipeTweenRef.current?.stop();
      swipeTweenRef.current = null;
    };
  }, []);

  // Motion values are reset synchronously at the moment we rotate the deck.

  const y0 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerY(0, unpackIntent(Number(code)), Number(p)),
  );
  const y1 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerY(1, unpackIntent(Number(code)), Number(p)),
  );
  const y2 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerY(2, unpackIntent(Number(code)), Number(p)),
  );
  /** Svg xl deck only: peek-band-top anchor + prod y → card 3 bottom flush with widget. */
  const nuroSvgCard3Y = useTransform(y2, (v) => v + NURO_SVG_STACK_PEEK_RESERVE_PX - PRIMARY_DECK_REST_Y[2]);
  const nuroSvgCard2Y = useTransform([y0, nuroSvgCard3Y], ([frontY, card3Y]) => (Number(frontY) + Number(card3Y)) / 2);
  const y3 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerY(3, unpackIntent(Number(code)), Number(p)),
  );

  const opacity0 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckFrontOpacity(unpackIntent(Number(code)), Number(p)),
  );

  const tier1OverlayOpacity = useTransform([swipePv, intentCodeMv], ([p, code]) => {
    const intent = unpackIntent(Number(code));
    if (intent !== "next") return 0;
    const u = clamp01Deck(Number(p));
    return u;
  });

  // Keep the top-card overlay locked. The top span already fades via `opacity0`,
  // so we do NOT crossfade a separate overlay layer (prevents landing-time shifts).
  const tier0OverlayOpacity = 1;

  const scale0 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerScale(0, unpackIntent(Number(code)), Number(p)),
  );
  const scale1 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerScale(1, unpackIntent(Number(code)), Number(p)),
  );
  const scale2 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerScale(2, unpackIntent(Number(code)), Number(p)),
  );
  const scale3 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckLayerScale(3, unpackIntent(Number(code)), Number(p)),
  );

  const opacityBehind1 = 1;
  const opacityBehind2 = 1;
  const opacityBehind3 = useTransform([swipePv, intentCodeMv], ([p, code]) =>
    primaryDeckTierOpacity(unpackIntent(Number(code)), 3, Number(p)),
  );

  const tierMotionStyle = {
    transformOrigin: "50% 100%" as const,
    willChange: "transform, opacity" as const,
  };

  /** Single continuous commit curve (no dwell at the top). */
  const easeOutLong: [number, number, number, number] = [0.22, 1, 0.32, 1];
  const easeInBack: [number, number, number, number] = [0.4, 0, 0.2, 1];

  const tweenTo = useCallback((target: number, kind: "commit" | "cancel") => {
    swipeTweenRef.current?.stop();
    const isCommit = kind === "commit";
    const ctrl = animate(swipePv, target, {
      type: "tween",
      duration: isCommit ? 0.34 : 0.28,
      ease: isCommit ? easeOutLong : easeInBack,
    });
    swipeTweenRef.current = ctrl;
    return ctrl;
  }, [swipePv]);

  const finishDrag = useCallback(async () => {
    const g = gestureRef.current;
    const pv = swipePv.get();
    gestureRef.current = null;
    dragRef.current = false;
    movedRef.current = false;
    pidRef.current = null;
    if (deck.length <= 1) {
      intentCodeMv.set(0);
      await tweenTo(0, "cancel");
      return;
    }
    if (!g || animRef.current) {
      intentCodeMv.set(0);
      await tweenTo(0, "cancel");
      return;
    }
    if (pv >= PRIMARY_DECK_COMMIT) {
      animRef.current = true;
      await tweenTo(1, "commit");
      queueMicrotask(() => {
        if (!mountedRef.current) {
          animRef.current = false;
          return;
        }
        flushSync(() => {
          onRotate(g === "next" ? 1 : -1);
        });
        swipePv.jump(0);
        intentCodeMv.jump(0);
        animRef.current = false;
      });
    } else {
      await tweenTo(0, "cancel");
      intentCodeMv.set(0);
    }
  }, [deck.length, intentCodeMv, onRotate, tweenTo, swipePv]);

  const flipOne = useCallback(
    (d: 1 | -1) => {
      if (animRef.current || deck.length <= 1) return;
      const dir = d === 1 ? "next" : "prev";
      gestureRef.current = dir;
      intentCodeMv.set(d === 1 ? 0 : 1);
      animRef.current = true;
      tweenTo(1, "commit").then(() => {
        gestureRef.current = null;
        queueMicrotask(() => {
          if (!mountedRef.current) {
            animRef.current = false;
            return;
          }
          flushSync(() => {
            onRotate(d);
          });
          swipePv.jump(0);
          intentCodeMv.jump(0);
          animRef.current = false;
        });
      });
    },
    [deck.length, intentCodeMv, onRotate, tweenTo, swipePv]
  );

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current || animRef.current || deck.length <= 1 || e.pointerId !== pidRef.current) return;
      const dy = startYRef.current - e.clientY;
      if (Math.abs(dy) > 5) movedRef.current = true;
      if (gestureRef.current === null) {
        if (Math.abs(dy) < 2) return;
        const dir = dy > 0 ? "next" : "prev";
        gestureRef.current = dir;
        intentCodeMv.set(dir === "next" ? 0 : 1);
      }
      const g = gestureRef.current!;
      const raw = g === "next" ? dy / PRIMARY_DECK_MAX_DRAG : (-dy) / PRIMARY_DECK_MAX_DRAG;
      swipePv.set(Math.max(0, Math.min(1, raw)));
    },
    [deck.length, intentCodeMv, swipePv]
  );

  const onUp = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== pidRef.current) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!movedRef.current && deck.length > 1 && !animRef.current) {
        gestureRef.current = null;
        intentCodeMv.set(0);
        swipePv.set(0);
        flipOne(1);
        dragRef.current = false;
        pidRef.current = null;
        return;
      }
      void finishDrag();
    },
    [finishDrag, flipOne, onMove, deck.length, swipePv]
  );

  const onFrontDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (animRef.current || deck.length <= 1) return;
      e.preventDefault();
      swipeTweenRef.current?.stop();
      dragRef.current = true;
      movedRef.current = false;
      gestureRef.current = null;
      intentCodeMv.set(0);
      startYRef.current = e.clientY;
      swipePv.set(0);
      pidRef.current = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [deck.length, intentCodeMv, onMove, onUp, swipePv]
  );

  const expand = expandToCell;
  const boost =
    expand ? 1 : tierWidthBoost > 1 && Number.isFinite(tierWidthBoost) ? tierWidthBoost : 1;
  const tierFrontPct = expand ? 100 : boost === 1 ? null : Math.min(100, 92 * boost);
  const tierAnchorClass = "bottom-0";

  const svgCardFaceWrapClass = (_isFront: boolean) =>
    "relative z-[1] w-full aspect-[316/190]";

  const renderSvgCardFace = (face: ReactNode, flexibleHeight = false) =>
    flexibleHeight ? (
      <div className="relative z-[1] h-full min-h-0 w-full max-w-none">{face}</div>
    ) : (
      <div
        className="relative z-[1] w-full max-w-none"
        style={{ paddingBottom: "calc(100% * (190 / 316))" }}
      >
        <div className="absolute inset-0 overflow-hidden">{face}</div>
      </div>
    );

  function renderNuroSvgTierContent(card: PrimaryDeckItem, idx: number) {
    const isFront = idx === 0;
    const isNext = idx === 1;
    const isT2 = idx === 2;

    const mockTier = getDesignMockCardFrontOverlay(card.id);
    const tierBalance = mockTier?.balance ?? hookUsdBalance;
    const tierSensitive = mockTier?.sensitive ?? hookSensitive;
    const tierCardName =
      (MOCK_CARDS.find((c) => c.id === card.id) as { cardName?: string } | undefined)?.cardName ?? "";
    const tierPan =
      isFront && sensitiveRevealed
        ? tierSensitive?.panRevealed ?? tierSensitive?.panMasked ?? "•••• •••• •••• ----"
        : tierSensitive?.panMasked ?? "•••• •••• •••• ----";

    return (
      <div
        className={cn(
          "relative w-full max-w-none",
          PRIMARY_DECK_CARD_CLIP_CLASS,
          isFront ? "h-full min-h-0" : "",
          isFront && newUserPrimaryCardCta && "group/card",
        )}
      >
        {isFront && !isDeckCtaRole(card.role) && newUserPrimaryCardCta ? (
          <div className="pointer-events-none absolute inset-0 z-[26] flex items-center justify-center px-3">
            <button
              type="button"
              className={cn(
                DECK_CTA_UPGRADE_BUTTON_CLASSNAME,
                "pointer-events-none w-auto max-w-none whitespace-nowrap px-5 py-3 opacity-0 transition-opacity duration-200",
                "group-hover/card:pointer-events-auto group-hover/card:opacity-100",
                "focus-visible:pointer-events-auto focus-visible:opacity-100",
              )}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (cardActivated) {
                  setReloadModalOpen(true);
                } else {
                  startKyc();
                }
              }}
              disabled={!cardActivated && kycStarting}
            >
              {cardActivated ? "Deposit Now" : tDash("deckHeroActivateFreeCardCta")}
            </button>
          </div>
        ) : null}

        {!isDeckCtaRole(card.role) ? (
          renderSvgCardFace(
            <NuroCodeCard
              balance={tierBalance}
              panMasked={tierPan}
              expiry={tierSensitive?.expiry ?? "—/—"}
              cvv={tierSensitive?.cvv ?? "•••"}
              sensitiveRevealed={isFront ? sensitiveRevealed : false}
              onToggleSensitive={
                isFront && !newUserPrimaryCardCta ? () => setSensitiveRevealed((x) => !x) : undefined
              }
              cardHolderName={cardHolderLine ?? "CHRIS BRIGNOLA"}
              cardName={tierCardName}
              isLoading={isFront ? overlayBalanceLoading : false}
              hideDetails={!isFront || newUserPrimaryCardCta}
              showShadow={false}
              showStroke={false}
            />,
            isFront,
          )
        ) : (
          <img
            src={isFront ? PRIMARY_DECK_C1_FACE_SRC : PRIMARY_DECK_STACK_BEHIND_FACE_SRC}
            alt={isFront ? "Nuro card" : ""}
            decoding="sync"
            draggable={false}
            className={cn(
              "relative z-[1] block w-full pointer-events-none select-none",
              isFront ? "h-full object-cover" : "object-contain object-bottom",
            )}
          />
        )}

        {!isFront && isNext ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-[2] rounded-[22px]",
              PRIMARY_DECK_PEEK_SCRIM_CLASS[1],
            )}
            aria-hidden
          />
        ) : null}
        {!isFront && isT2 ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-[2] rounded-[22px]",
              PRIMARY_DECK_PEEK_SCRIM_CLASS[2],
            )}
            aria-hidden
          />
        ) : null}

        {card.role === "deck-cta-plus" ? (
          <div className="pointer-events-none absolute inset-0 z-[24]">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 py-3">
              <button
                type="button"
                className={cn(DECK_CTA_UPGRADE_BUTTON_CLASSNAME, "pointer-events-auto")}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setUpgradeModalOpen(true);
                }}
              >
                {tDash("deckHeroNuroPlusCta")}
              </button>
              <p className="max-w-[min(100%,15rem)] text-center text-[10px] font-medium leading-snug text-white/80">
                {tDash("deckHeroNuroPlusSubcopy")}
              </p>
            </div>
          </div>
        ) : null}

        {card.role === "deck-cta-pro" ? (
          <div className="pointer-events-none absolute inset-0 z-[24]">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 py-3">
              <button
                type="button"
                className={cn(DECK_CTA_UPGRADE_BUTTON_CLASSNAME, "pointer-events-auto")}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setUpgradeModalOpen(true);
                }}
              >
                {tDash("deckHeroNuroProCta")}
              </button>
              <p className="max-w-[min(100%,15rem)] text-center text-[10px] font-medium leading-snug text-white/78">
                {tDash("deckHeroNuroProSubcopy")}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderNuroSvgDeckTiers() {
    return deck.slice(0, 3).map((card, idx) => {
      const isFront = idx === 0;
      const isNext = idx === 1;
      const isT2 = idx === 2;

      let zIndex = 0;
      let y = y3;
      let scale = scale3;
      let opacity = opacityBehind3;

      if (isFront) {
        zIndex = 3;
        y = y0;
        scale = scale0;
        opacity = opacity0;
      } else if (isNext) {
        zIndex = 2;
        y = nuroSvgCard2Y;
        scale = scale1;
        opacity = opacityBehind1;
      } else if (isT2) {
        zIndex = 1;
        y = nuroSvgCard3Y;
        scale = scale2;
        opacity = opacityBehind2;
      }

      return (
        <motion.span
          key={`primary-deck-tier-${idx}`}
          data-primary-deck-tier
          aria-hidden={!isFront}
          className={cn(
            "absolute inset-x-0 block w-full max-w-none",
            isFront ? "top-0" : "",
            isFront && deck.length > 1 && "cursor-grab active:cursor-grabbing",
            !isFront && "pointer-events-none",
          )}
          style={{
            ...tierMotionStyle,
            zIndex,
            y,
            scale,
            opacity,
            bottom: NURO_SVG_STACK_PEEK_RESERVE_PX,
            ...(isFront ? { top: 0 } : {}),
            touchAction: isFront ? "pan-y" : undefined,
          }}
          onPointerDown={isFront ? onFrontDown : undefined}
        >
          {isFront ? (
            <div className="absolute inset-0 min-h-0">{renderNuroSvgTierContent(card, idx)}</div>
          ) : (
            <div className="flex w-full flex-col justify-end">{renderNuroSvgTierContent(card, idx)}</div>
          )}
        </motion.span>
      );
    });
  }

  function renderDeckTiers() {
    if (nuroCodeCardStack) {
      return (
        <div className="absolute inset-0 overflow-visible">{renderNuroSvgDeckTiers()}</div>
      );
    }

    return (
      <>
        {/* 1. Phantom back card: clone of the front card during swipe to handle wrap-around without flashes */}
        {deck.length > 3 && (
          <motion.span
            key="phantom-back"
            data-primary-deck-tier
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 z-[0] mx-auto block max-w-[100%]",
              tierAnchorClass,
              boost === 1 && !expand && "w-[92%]",
            )}
            style={{
              ...tierMotionStyle,
              y: y3,
              scale: scale3,
              opacity: opacityBehind3,
              ...(tierFrontPct !== null ? { width: `${tierFrontPct}%` } : {}),
            }}
          >
            <div className={cn("relative flex w-full flex-col justify-end", PRIMARY_DECK_CARD_CLIP_CLASS)}>
              <img
                src={PRIMARY_DECK_C1_FACE_SRC}
                alt=""
                decoding="sync"
                draggable={false}
                className="relative z-[1] block h-auto w-full pointer-events-none select-none"
              />
            </div>
          </motion.span>
        )}

        {/* 2. Real cards mapped by persistent ID */}
        {deck.map((card, idx) => {
          const isFront = idx === 0;
          const isNext = idx === 1;
          const isT2 = idx === 2;
          const isT3 = idx === 3;

          // Determine styles based on index
          let zIndex = 0;
          let y = y3,
            scale = scale3,
            opacity = opacityBehind3;

          if (isFront) {
            zIndex = 3;
            y = y0;
            scale = scale0;
            opacity = opacity0;
          } else if (isNext) {
            zIndex = 2;
            y = y1;
            scale = scale1;
            opacity = opacityBehind1;
          } else if (isT2) {
            zIndex = 1;
            y = y2;
            scale = scale2;
            opacity = opacityBehind2;
          }

          return (
            <motion.span
              key={`primary-deck-tier-${idx}`}
              data-primary-deck-tier
              aria-hidden={!isFront}
              className={cn(
                "absolute mx-auto block max-w-[100%]",
                cn("inset-x-0", tierAnchorClass),
                boost === 1 && !expand && "w-[92%]",
                isFront && deck.length > 1 && "cursor-grab active:cursor-grabbing",
                !isFront && "pointer-events-none",
              )}
              style={{
                ...tierMotionStyle,
                zIndex,
                y,
                scale,
                opacity,
                touchAction: isFront ? "pan-y" : undefined,
                ...(tierFrontPct !== null ? { width: `${tierFrontPct}%` } : {}),
              }}
              onPointerDown={isFront ? onFrontDown : undefined}
            >
              <div
                className={cn(
                  "relative w-full max-w-none",
                  PRIMARY_DECK_CARD_CLIP_CLASS,
                  isFront && newUserPrimaryCardCta && "group/card",
                )}
              >
                {/* Front Overlay */}
                {isFront && !isDeckCtaRole(card.role) && !useSvgTier(isFront) && (
                  <motion.div className="absolute inset-0 z-[25]" style={{ opacity: tier0OverlayOpacity }}>
                    {!newUserPrimaryCardCta && (
                      <div className="pointer-events-none absolute left-[8%] right-[26%] top-[11%] z-[20]">
                        {smCardFace && cardHolderLine ? (
                          <p
                            className="mb-1 truncate font-medium leading-tight text-white/80"
                            style={{ fontSize: "clamp(0.6875rem, 2.4vw, 0.8125rem)" }}
                          >
                            {cardHolderLine}
                          </p>
                        ) : null}
                        <div
                          aria-live="polite"
                          aria-label={
                            overlayBalanceLoading
                              ? "Balance loading"
                              : `Card balance ${formatUsd(overlayUsdBalance)}`
                          }
                        >
                        {overlayBalanceLoading ? (
                          <span
                            className="inline-block font-semibold tabular-nums tracking-tight text-white/55"
                            style={
                              smCardFace
                                ? { fontSize: "clamp(1.375rem, 7vw, 2.25rem)", lineHeight: 1.05 }
                                : undefined
                            }
                          >
                            —
                          </span>
                        ) : (
                          <span
                            className="inline-block font-semibold tabular-nums tracking-tight text-white"
                            style={{
                              fontSize: smCardFace
                                ? "clamp(1.375rem, 7vw, 2.25rem)"
                                : "clamp(1rem, 3.2vw, 1.35rem)",
                              lineHeight: 1.05,
                            }}
                          >
                            {formatUsd(overlayUsdBalance)}
                          </span>
                        )}
                        </div>
                      </div>
                    )}

                    {(overlaySensitiveLoading || overlaySensitive) && (
                      <div className="pointer-events-none absolute bottom-[26%] left-[8%] right-[6%] z-[20] text-left sm:bottom-[27%] md:bottom-[29%]">
                        <div className="flex w-full min-w-0 translate-y-[5px] flex-col gap-0">
                          {overlaySensitiveLoading ? (
                            <>
                              <div className="h-2.5 w-40 max-w-[55%] rounded bg-white/[0.08]" aria-hidden />
                              <div className="flex min-w-0 items-center gap-2 pb-3">
                                <div
                                  className="h-4 min-h-[1rem] min-w-0 flex-1 rounded bg-white/10"
                                  aria-hidden
                                />
                              </div>
                            </>
                          ) : overlaySensitive ? (
                            <>
                              <div
                                className={cn(
                                  "leading-none flex flex-nowrap items-center gap-x-4 tabular-nums transition-colors",
                                  sensitiveRevealed ? "text-white" : "text-white/55",
                                )}
                                style={{
                                  fontSize: smCardFace
                                    ? "clamp(0.875rem, 3.4vw, 1.0625rem)"
                                    : "clamp(0.625rem, 2vw, 0.6875rem)",
                                }}
                              >
                                <span className="shrink-0 whitespace-nowrap">
                                  <span className={sensitiveRevealed ? "text-white/72" : "text-white/50"}>
                                    Expires
                                  </span>{" "}
                                  {sensitiveRevealed ? overlaySensitive.expiry : "••/••"}
                                </span>
                                <span className="shrink-0 whitespace-nowrap">
                                  <span className={sensitiveRevealed ? "text-white/72" : "text-white/50"}>
                                    CVV
                                  </span>{" "}
                                  {sensitiveRevealed ? (overlaySensitive.cvv ?? "—") : "•••"}
                                </span>
                              </div>
                              <div className="flex min-w-0 items-center gap-2 pb-3">
                                <p
                                  className={cn(
                                    "m-0 min-w-0 flex-1 truncate font-semibold leading-tight tracking-[0.05em] transition-colors",
                                    sensitiveRevealed ? "text-white" : "text-white/55",
                                  )}
                                  style={{ fontSize: "clamp(0.875rem, 3.4vw, 1.0625rem)" }}
                                  aria-label="Card number"
                                >
                                  {sensitiveRevealed
                                    ? overlaySensitive.panRevealed ?? overlaySensitive.panMasked
                                    : overlaySensitive.panMasked}
                                </p>
                                <button
                                  type="button"
                                  className={cn(
                                    "pointer-events-auto inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] p-0 align-middle outline-none ring-offset-2 ring-offset-transparent transition-colors focus-visible:ring-2 focus-visible:ring-white/35",
                                    sensitiveRevealed
                                      ? "text-white hover:bg-white/[0.05] hover:text-white"
                                      : "text-white/55 hover:bg-white/[0.04] hover:text-white/90",
                                  )}
                                  aria-pressed={sensitiveRevealed}
                                  aria-label={
                                    sensitiveRevealed
                                      ? "Hide card number, expiry, and CVV"
                                      : "Show card number, expiry, and CVV"
                                  }
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSensitiveRevealed((x) => !x);
                                  }}
                                >
                                  {sensitiveRevealed ? (
                                    <EyeOff className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                                  ) : (
                                    <Eye className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                                  )}
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )}
                    {newUserPrimaryCardCta && (
                      <div className="pointer-events-none absolute inset-0 z-[26] flex items-center justify-center px-3">
                        <button
                          type="button"
                          className={cn(
                            DECK_CTA_UPGRADE_BUTTON_CLASSNAME,
                            "pointer-events-none w-auto max-w-none whitespace-nowrap px-5 py-3 opacity-0 transition-opacity duration-200",
                            "group-hover/card:pointer-events-auto group-hover/card:opacity-100",
                            "focus-visible:pointer-events-auto focus-visible:opacity-100",
                          )}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (cardActivated) {
                              setReloadModalOpen(true);
                            } else {
                              startKyc();
                            }
                          }}
                          disabled={!cardActivated && kycStarting}
                        >
                          {cardActivated ? "Deposit Now" : tDash("deckHeroActivateFreeCardCta")}
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {isFront && !isDeckCtaRole(card.role) && useSvgTier(isFront) && newUserPrimaryCardCta && (
                  <div className="pointer-events-none absolute inset-0 z-[26] flex items-center justify-center px-3">
                    <button
                      type="button"
                      className={cn(
                        DECK_CTA_UPGRADE_BUTTON_CLASSNAME,
                        "pointer-events-none w-auto max-w-none whitespace-nowrap px-5 py-3 opacity-0 transition-opacity duration-200",
                        "group-hover/card:pointer-events-auto group-hover/card:opacity-100",
                        "focus-visible:pointer-events-auto focus-visible:opacity-100",
                      )}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (cardActivated) {
                          setReloadModalOpen(true);
                        } else {
                          startKyc();
                        }
                      }}
                      disabled={!cardActivated && kycStarting}
                    >
                      {cardActivated ? "Deposit Now" : tDash("deckHeroActivateFreeCardCta")}
                    </button>
                  </div>
                )}

                {/* Next Overlay */}
                {isNext && !isDeckCtaRole(card.role) && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 z-[20]"
                    style={{ opacity: tier1OverlayOpacity }}
                  >
                    <div className="pointer-events-none absolute left-[8%] right-[26%] top-[11%]">
                      <div
                        aria-label={
                          nextBalanceLoading
                            ? "Balance loading"
                            : `Card balance ${formatUsd(nextUsdBalance)}`
                        }
                      >
                        {nextBalanceLoading ? (
                          <span className="inline-block font-semibold tabular-nums tracking-tight text-white/55">
                            —
                          </span>
                        ) : (
                          <span
                            className="inline-block font-semibold tabular-nums tracking-tight text-white"
                            style={{ fontSize: "clamp(1rem, 3.2vw, 1.35rem)", lineHeight: 1.1 }}
                          >
                            {formatUsd(nextUsdBalance)}
                          </span>
                        )}
                      </div>
                    </div>

                    {(nextSensitiveLoading || nextSensitive) && (
                      <div className="pointer-events-none absolute bottom-[26%] left-[8%] right-[6%] text-left sm:bottom-[27%] md:bottom-[29%]">
                        <div className="flex w-full min-w-0 translate-y-[5px] flex-col gap-0">
                          {nextSensitiveLoading ? (
                            <>
                              <div className="h-2.5 w-40 max-w-[55%] rounded bg-white/[0.08]" aria-hidden />
                              <div className="flex min-w-0 items-center gap-2 pb-3">
                                <div
                                  className="h-4 min-h-[1rem] min-w-0 flex-1 rounded bg-white/10"
                                  aria-hidden
                                />
                              </div>
                            </>
                          ) : nextSensitive ? (
                            <>
                              <div
                                className="leading-none flex flex-nowrap items-center gap-x-4 tabular-nums text-white/55"
                                style={{ fontSize: "clamp(0.625rem, 2vw, 0.6875rem)" }}
                              >
                                <span className="shrink-0 whitespace-nowrap">
                                  <span className="text-white/50">Expires</span> {"••/••"}
                                </span>
                                <span className="shrink-0 whitespace-nowrap">
                                  <span className="text-white/50">CVV</span> {"•••"}
                                </span>
                              </div>
                              <div className="flex min-w-0 items-center gap-2 pb-3">
                                <p
                                  className="m-0 min-w-0 flex-1 truncate font-semibold leading-tight tracking-[0.05em] text-white/55"
                                  style={{ fontSize: "clamp(0.875rem, 3.4vw, 1.0625rem)" }}
                                  aria-label="Card number"
                                >
                                  {nextSensitive.panMasked}
                                </p>
                                <div className="pointer-events-none inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] p-0 align-middle text-white/55">
                                  <Eye className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                <div
                  className={cn(
                    "relative w-full",
                    isFront && !nuroCodeCardStack && "flex flex-col justify-end",
                  )}
                >
                  {useSvgTier(isFront) && !isDeckCtaRole(card.role) ? (
                    (() => {
                      const mockTier = getDesignMockCardFrontOverlay(card.id);
                      const tierBalance = mockTier?.balance ?? hookUsdBalance;
                      const tierSensitive = mockTier?.sensitive ?? hookSensitive;
                      const tierCardName =
                        (MOCK_CARDS.find((c) => c.id === card.id) as { cardName?: string } | undefined)
                          ?.cardName ?? "";
                      const tierPan =
                        isFront && sensitiveRevealed
                          ? tierSensitive?.panRevealed ?? tierSensitive?.panMasked ?? "•••• •••• •••• ----"
                          : tierSensitive?.panMasked ?? "•••• •••• •••• ----";
                      const tierFace = (
                        <NuroCodeCard
                          balance={tierBalance}
                          panMasked={tierPan}
                          expiry={tierSensitive?.expiry ?? "—/—"}
                          cvv={tierSensitive?.cvv ?? "•••"}
                          sensitiveRevealed={isFront ? sensitiveRevealed : false}
                          onToggleSensitive={
                            isFront && !newUserPrimaryCardCta
                              ? () => setSensitiveRevealed((x) => !x)
                              : undefined
                          }
                          cardHolderName={cardHolderLine ?? "CHRIS BRIGNOLA"}
                          cardName={tierCardName}
                          isLoading={isFront ? overlayBalanceLoading : false}
                          hideDetails={!isFront || newUserPrimaryCardCta}
                          showShadow={false}
                        />
                      );
                      return (
                        <div className={svgCardFaceWrapClass(isFront)}>{tierFace}</div>
                      );
                    })()
                  ) : (
                    <img
                      src={isFront ? PRIMARY_DECK_C1_FACE_SRC : PRIMARY_DECK_STACK_BEHIND_FACE_SRC}
                      alt={isFront ? "Nuro card" : ""}
                      decoding="sync"
                      draggable={false}
                      className={cn(
                        "relative z-[1] block w-full pointer-events-none select-none",
                        isFront ? "h-auto" : "object-contain object-bottom",
                      )}
                    />
                  )}
                  {!isFront && isNext ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 z-[2] rounded-[22px]",
                        PRIMARY_DECK_PEEK_SCRIM_CLASS[1],
                      )}
                      aria-hidden
                    />
                  ) : null}
                  {!isFront && isT2 ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 z-[2] rounded-[22px]",
                        PRIMARY_DECK_PEEK_SCRIM_CLASS[2],
                      )}
                      aria-hidden
                    />
                  ) : null}
                </div>

                {card.role === "deck-cta-plus" && (
                  <div className="pointer-events-none absolute inset-0 z-[24]">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 py-3">
                      <button
                        type="button"
                        className={cn(DECK_CTA_UPGRADE_BUTTON_CLASSNAME, "pointer-events-auto")}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setUpgradeModalOpen(true);
                        }}
                      >
                        {tDash("deckHeroNuroPlusCta")}
                      </button>
                      <p className="max-w-[min(100%,15rem)] text-center text-[10px] font-medium leading-snug text-white/80">
                        {tDash("deckHeroNuroPlusSubcopy")}
                      </p>
                    </div>
                  </div>
                )}

                {card.role === "deck-cta-pro" && (
                  <div className="pointer-events-none absolute inset-0 z-[24]">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 py-3">
                      <button
                        type="button"
                        className={cn(DECK_CTA_UPGRADE_BUTTON_CLASSNAME, "pointer-events-auto")}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setUpgradeModalOpen(true);
                        }}
                      >
                        {tDash("deckHeroNuroProCta")}
                      </button>
                      <p className="max-w-[min(100%,15rem)] text-center text-[10px] font-medium leading-snug text-white/78">
                        {tDash("deckHeroNuroProSubcopy")}
                      </p>
                    </div>
                  </div>
                )}

              </div>
            </motion.span>
          );
        })}
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        nuroCodeCardStack ? "shrink-0 overflow-hidden" : "min-h-0 min-w-0 overflow-visible",
        expand ? "w-full shrink-0 pb-0" : "min-h-0 flex-1 pb-4",
      )}
    >
      {expand ? (
        <div
          data-primary-deck-measure-root
          className={cn(
            "w-full shrink-0 rounded-none",
            nuroCodeCardStack
              ? "relative w-full shrink-0 overflow-visible"
              : "flex min-h-0 min-w-0 shrink-0 flex-col items-stretch justify-start overflow-visible",
          )}
          style={
            nuroCodeCardStack
              ? svgDeckPaintHeightPx != null && svgDeckPaintHeightPx > 0
                ? { height: svgDeckPaintHeightPx }
                : {
                    height: 0,
                    paddingBottom: `calc(100% * (190 / 316) + ${NURO_SVG_STACK_PEEK_RESERVE_PX}px)`,
                  }
              : undefined
          }
        >
          {nuroCodeCardStack ? (
            <div className="absolute inset-0 min-h-0 overflow-visible">{renderDeckTiers()}</div>
          ) : (
            <div
              className="relative w-full max-w-full shrink-0 overflow-visible"
              style={{
                paddingBottom:
                  smCardFace && suppressQuickActionsBar
                    ? 0
                    : PRIMARY_DECK_STACK_LAYOUT_EXTRA_BELOW_PX +
                      PRIMARY_DECK_EXPAND_ASPECT_WINDOW_SHRINK_PX,
              }}
            >
              <div
                className="relative w-full max-w-full overflow-visible"
                style={{
                  height: 0,
                  paddingBottom: "calc(100% * (100 / 158))",
                }}
              >
                <div className="absolute inset-0 overflow-visible">{renderDeckTiers()}</div>
              </div>
            </div>
          )}
          {!suppressQuickActionsBar && !nuroCodeCardStack ? (
            <Layout3DeckQuickActionsBar
              deckActionsEnabled={deckActionsEnabled}
              onReload={() => setReloadModalOpen(true)}
              onWithdraw={() => setWithdrawModalOpen(true)}
              onActivity={() => setActivityModalOpen(true)}
            />
          ) : null}
        </div>
      ) : (
        <div className="relative flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col justify-end overflow-visible rounded-[14px]">
          <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-end overflow-visible">
            {renderDeckTiers()}
          </div>
        </div>
      )}
      <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />
      {!sharedReloadModal ? (
        <ReloadModal open={reloadModalOpen} onOpenChange={setReloadModalOpen} />
      ) : null}
      <WithdrawModal open={withdrawModalOpen} onOpenChange={setWithdrawModalOpen} />
      <TransactionsModal
        open={activityModalOpen}
        onOpenChange={setActivityModalOpen}
        title={activityModalTitle}
        transactions={cardTransactionsForDeck}
        isLoading={activityTransactionsLoading}
        onTransactionSelect={handleTransactionSelect}
      />
      <TransactionDetailModal
        open={isTransactionDetailOpen}
        onOpenChange={(open) => {
          if (!open) closeTransactionDetail();
        }}
        tx={selectedTransaction}
      />
    </div>
  );
}

/** Pass B sm (&lt;768): balance/PAN on card face; Reload + Withdraw below — no My Card widget. */
export function HomeSmPrimaryCardTop({
  newUserPrimaryCardCta = false,
}: {
  newUserPrimaryCardCta?: boolean;
}) {
  const { data: session } = useAppSession();
  const { primaryDeck, rotatePrimaryDeck } = usePrimaryDeckStack();
  const {
    balance: overviewCardsUsdBalance,
    isOverlayLoading: overviewCardsOverlayLoading,
    primarySensitive: overviewPrimarySensitive,
  } = useAccountBalance();
  const dashboardRefresh = useDashboardRefreshOptional();
  const deckQuickActions = usePrimaryDeckQuickActions(newUserPrimaryCardCta);
  const [reloadModalOpen, setReloadModalOpen] = useState(false);
  const frontId = primaryDeck[0]?.id ?? "";
  const cardHolderLine = useMemo(() => {
    const mc = MOCK_CARDS.find((c) => c.id === frontId) as
      | { cardHolder?: string }
      | undefined;
    if (mc?.cardHolder) {
      return mc.cardHolder === DEMO_USER_FULL_NAME ? DEMO_USER_SHORT_NAME : mc.cardHolder;
    }
    const sessionName = (session?.user as { name?: string } | undefined)?.name;
    if (sessionName && !sessionName.startsWith("Nuro User")) {
      return sessionName.split(" ")[0] ?? sessionName;
    }
    return DEMO_USER_SHORT_NAME;
  }, [frontId, session]);

  const deckWrapRef = useRef<HTMLDivElement>(null);
  const [actionsMarginTopPx, setActionsMarginTopPx] = useState(SM_DECK_TO_ACTIONS_GAP_PX);

  useLayoutEffect(() => {
    const root = deckWrapRef.current;
    if (!root) return;

    const measure = () => {
      const shell =
        root.querySelector<HTMLElement>("[data-primary-deck-measure-root]") ?? root;
      const layoutH = shell.offsetHeight;
      const rootTop = shell.getBoundingClientRect().top;
      const tiers = root.querySelectorAll<HTMLElement>("[data-primary-deck-tier]");
      let maxBottom = 0;
      tiers.forEach((tier) => {
        maxBottom = Math.max(maxBottom, tier.getBoundingClientRect().bottom - rootTop);
      });
      if (layoutH <= 0 || maxBottom <= 0) {
        setActionsMarginTopPx(SM_DECK_TO_ACTIONS_GAP_PX);
        return;
      }
      setActionsMarginTopPx(maxBottom + SM_DECK_TO_ACTIONS_GAP_PX - layoutH);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [primaryDeck]);

  const deckStack = (
    <VariantPrimaryDeckStack
      deck={primaryDeck}
      onRotate={rotatePrimaryDeck}
      hookUsdBalance={overviewCardsUsdBalance}
      hookSensitive={overviewPrimarySensitive}
      hookOverlayLoading={
        overviewCardsOverlayLoading || (dashboardRefresh?.isRefreshing ?? false)
      }
      expandToCell
      smCardFace
      nuroCodeCardFace
      cardHolderLine={cardHolderLine}
      newUserPrimaryCardCta={newUserPrimaryCardCta}
      suppressQuickActionsBar
      deckQuickActions={deckQuickActions}
      sharedReloadModal={
        newUserPrimaryCardCta
          ? { open: reloadModalOpen, onOpenChange: setReloadModalOpen }
          : undefined
      }
    />
  );

  return (
    <div className="flex w-full min-w-0 flex-col overflow-visible">
      <div ref={deckWrapRef} className="relative w-full shrink-0 overflow-visible">
        {deckStack}
      </div>
      <div style={{ marginTop: actionsMarginTopPx }}>
        <ActionButtons
          noTopMargin
          reloadOnly
          onReloadClick={() => {
            if (newUserPrimaryCardCta) setReloadModalOpen(true);
            else deckQuickActions.setReloadModalOpen(true);
          }}
          onWithdrawClick={() => deckQuickActions.setWithdrawModalOpen(true)}
        />
      </div>
    </div>
  );
}

/**
 * Four share bands separated by gaps (largest left). Each band is dense vertical tally pillars —
 * tall narrow capsules with slim gaps inside the band — one solid tone per band.
 */
const SMART_SPEND_SEGMENT_FILLS = [
  "var(--color-primary)",
  "color-mix(in oklab, var(--color-primary) 70%, var(--color-bg-card) 30%)",
  "color-mix(in oklab, var(--color-primary) 42%, var(--color-bg-card) 58%)",
  "color-mix(in oklab, color-mix(in oklab, var(--color-primary) 55%, #ffffff 45%) 50%, var(--color-bg-card) 50%)",
] as const;

const SMART_SPEND_SECTION_GAP_UV = 10;
/**
 * Tally marks per share band — chunkier pillars + slightly wider gutters so they read at a glance on this card.
 */
const SMART_SPEND_TALLY_INNER_GAP_UV = 0.82;
const SMART_SPEND_PILLAR_TARGET_UV = 3.5;

function tallyCountAndWidth(segW_uv: number, gap: number): { count: number; pillarW: number } {
  const minPillarUv = 1.85;
  if (segW_uv <= gap + minPillarUv * 2) return { count: 1, pillarW: segW_uv };

  const stride = SMART_SPEND_PILLAR_TARGET_UV + gap;
  let count = Math.floor((segW_uv + gap) / stride);
  count = Math.max(4, Math.min(200, count));

  while (count > 1) {
    const pillarW = (segW_uv - (count - 1) * gap) / count;
    if (pillarW >= minPillarUv) return { count, pillarW };
    count--;
  }
  return { count: 1, pillarW: segW_uv };
}

function SmartSpendingSegmentedMixBar({
  shares,
}: {
  /** Weights left → right; pass sorted descending (biggest category first). */
  shares: readonly [number, number, number, number];
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const vbW = 300;
  const vbH = 10;
  const sectionGap = SMART_SPEND_SECTION_GAP_UV;
  const innerGap = SMART_SPEND_TALLY_INNER_GAP_UV;

  const [a, b, c, d] = shares;
  const sum = a + b + c + d || 1;
  const inner = vbW - 3 * sectionGap;
  const widths = [
    Math.max(4, (inner * a) / sum),
    Math.max(4, (inner * b) / sum),
    Math.max(4, (inner * c) / sum),
    Math.max(4, (inner * d) / sum),
  ] as const;

  type SliceRect = { x: number; w: number; r: number; fillIdx: number; key: string };
  const sliceRects: SliceRect[] = [];
  let sectionX = 0;
  widths.forEach((segW, segIdx) => {
    const fillIdx = segIdx as 0 | 1 | 2 | 3;
    let { count, pillarW } = tallyCountAndWidth(segW, innerGap);
    const tallySpan = pillarW * count + innerGap * (count - 1);
    const slack = Math.max(0, segW - tallySpan);
    let x = sectionX + slack / 2;
    const rCaps = Math.min(pillarW / 2, vbH / 2) * 0.96;

    for (let j = 0; j < count; j++) {
      sliceRects.push({
        x,
        w: pillarW,
        r: rCaps,
        fillIdx,
        key: `${segIdx}-${j}`,
      });
      x += pillarW + innerGap;
    }

    sectionX += segW + (segIdx < 3 ? sectionGap : 0);
  });

  return (
    <svg
      className="h-2 w-full min-w-0 shrink-0 text-[inherit] sm:h-2.5"
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Spend share: four gated sections with tally pillars inside each band; tones left to largest share"
    >
      {sliceRects.map((sr) => (
        <motion.rect
          key={`ssm-${uid}-${sr.key}`}
          layout
          initial={false}
          animate={{
            fill: SMART_SPEND_SEGMENT_FILLS[sr.fillIdx],
            x: sr.x,
            width: sr.w,
          }}
          transition={{
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1],
          }}
          height={vbH}
          rx={sr.r}
          ry={sr.r}
          y={0}
        />
      ))}
    </svg>
  );
}

/** Card Usage panel: daily spend vs limit + categorical spend bar + legend (layout 3 deck column). */
function CardUsageLimitsPanel({
  busy = false,
  fillTallShell = false,
  data = {
    dailyUsed: 1200,
    dailyCap: 2000,
    categories: [
      { key: "subs", share: 35, label: "Subscriptions (35%)" },
      { key: "shop", share: 27, label: "Flights (27%)" },
      { key: "other", share: 20, label: "Other (20%)" },
      { key: "dine", share: 18, label: "Claude API (18%)" },
    ],
  },
}: {
  busy?: boolean;
  fillTallShell?: boolean;
  data?: {
    dailyUsed: number;
    dailyCap: number;
    categories: { key: string; share: number; label: string }[];
  };
}) {
  const { dailyUsed, dailyCap, categories } = data;
  const usedLine =
    dailyUsed === 0 ? `${formatUsdCompact(dailyUsed)} used` : `${formatUsd(dailyUsed)} used`;

  const barLeftToRight = [...categories].sort((a, b) => b.share - a.share);
  const barShares = [
    barLeftToRight[0]?.share ?? 0,
    barLeftToRight[1]?.share ?? 0,
    barLeftToRight[2]?.share ?? 0,
    barLeftToRight[3]?.share ?? 0,
  ] as const;

  /** Same order as bar (largest → smallest); dot color matches segment index. */
  const legendRows = barLeftToRight.map((c, idx) => ({
    key: c.key,
    label: c.label,
    dot: { background: SMART_SPEND_SEGMENT_FILLS[idx] } satisfies CSSProperties,
  }));

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col",
        fillTallShell
          ? "min-h-0 flex-1 justify-evenly"
          : "gap-5 sm:gap-6",
      )}
    >
      <section className="shrink-0" aria-label="Daily limit summary">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 leading-snug">
          {busy ? (
            <WalletSkeletonText className="text-[17px] font-semibold tabular-nums tracking-tight sm:text-[18px]">
              {usedLine}
            </WalletSkeletonText>
          ) : (
            <span className="text-[17px] font-semibold tabular-nums tracking-tight text-[var(--color-text-primary)] sm:text-[18px]">
              {usedLine}
            </span>
          )}
          {busy ? (
            <WalletSkeletonText className="text-[10px] font-medium tabular-nums leading-snug sm:text-[11px]">
              from {formatUsdCompact(dailyCap)} limit
            </WalletSkeletonText>
          ) : (
            <span className="text-[10px] font-medium tabular-nums leading-snug text-[var(--color-text-muted)] sm:text-[11px]">
              from {formatUsdCompact(dailyCap)} limit
            </span>
          )}
        </div>
      </section>

      <section className="shrink-0 pt-1 sm:pt-1.5" aria-label="Spending breakdown">
        <div className="mb-2 text-[10px] font-semibold leading-tight text-white/42 sm:mb-2.5">
          Spending
        </div>
        {busy ? (
          <div className="h-2 w-full min-w-0 shrink-0 sm:h-2.5" aria-hidden>
            <span className="block h-full w-full animate-pulse rounded-[10px] bg-white/[0.08]" />
          </div>
        ) : (
          <SmartSpendingSegmentedMixBar shares={barShares} />
        )}
      </section>

      <section className="shrink-0 pt-4 sm:pt-5" aria-label="Spend category breakdown">
        <ul className="m-0 grid list-none grid-cols-2 gap-x-5 gap-y-4 p-0 sm:gap-y-4.5">
          {legendRows.map((row, idx) => (
            <li key={row.key} className="flex min-h-0 min-w-0 items-center gap-2.5">
              <span className="size-3 shrink-0 rounded-[4px]" style={row.dot} aria-hidden />
              <motion.span
                key={row.label}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                className="min-w-0 truncate text-[10px] font-medium leading-snug text-[var(--color-text-muted)] sm:text-[11px]"
              >
                {row.label}
              </motion.span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const CARD_USAGE_MOCK_DATA: Record<
  string,
  {
    dailyUsed: number;
    dailyCap: number;
    categories: { key: string; share: number; label: string }[];
  }
> = {
  c1: {
    dailyUsed: 1420.69,
    dailyCap: 2000,
    categories: [
      { key: "subs", share: 35, label: "Subscriptions (35%)" },
      { key: "shop", share: 27, label: "Flights (27%)" },
      { key: "other", share: 20, label: "Other (20%)" },
      { key: "dine", share: 18, label: "Claude API (18%)" },
    ],
  },
  c2: {
    dailyUsed: 847.2,
    dailyCap: 5000,
    categories: [
      { key: "travel", share: 45, label: "Travel (45%)" },
      { key: "food", share: 25, label: "Dining (25%)" },
      { key: "ent", share: 20, label: "Entertainment (20%)" },
      { key: "misc", share: 10, label: "Miscellaneous (10%)" },
    ],
  },
  c3: {
    dailyUsed: 2105.0,
    dailyCap: 3000,
    categories: [
      { key: "tech", share: 50, label: "Electronics (50%)" },
      { key: "work", share: 30, label: "Software (30%)" },
      { key: "office", share: 15, label: "Office (15%)" },
      { key: "coffee", share: 5, label: "Coffee (5%)" },
    ],
  },
};

const EMPTY_CARD_USAGE_DATA = {
  dailyUsed: 0,
  dailyCap: 0,
  categories: [
    { key: "slot-1", share: 0, label: "No data" },
    { key: "slot-2", share: 0, label: "No data" },
    { key: "slot-3", share: 0, label: "No data" },
    { key: "slot-4", share: 0, label: "No data" },
  ],
};

function resolveCardUsageLimitsCardId(deck: PrimaryDeckItem[]): string {
  const front = deck[0];
  if (!front || isDeckCtaRole(front.role) || front.id === DECK_SLOT_EMPTY_ID) {
    return "c1";
  }
  return front.id;
}

/**
 * Layout 2 hero: flat **`xl:grid-cols-12`** row — balance · spending · primary (**`xl:col-span-4`** each), drag-reorder, own persisted order.
 * Layout 3 hero: slim bucket **`xl:col-span-8`** + deck **`xl:col-span-4`**, includes Cash flow tile — unchanged grid + chromeless deck path.
 * **`layout3LeftColumns={2}`**: same row geometry with two slim tiles + deck (order isolated, not persisted — layout experiments).
 */
export function OverviewTopThreeHeroRow({
  overviewLayout,
  layout3LeftColumns = 3,
  newUserPrimaryCardCta = false,
  hidePrimaryDeck = false,
  smHeroKpisOnly = false,
  homeResponsiveSvgDeck = false,
}: {
  overviewLayout: "2" | "3";
  /** Layout 3 only: `3` = three slim widgets (default); `2` = two wider slim widgets + deck. */
  layout3LeftColumns?: 2 | 3;
  /** New-user preview: front deck card shows activate CTA instead of balance/PAN. */
  newUserPrimaryCardCta?: boolean;
  /** Pass B md: compact CardSection replaces hero deck — keep KPI / cash flow / upgrade row. */
  hidePrimaryDeck?: boolean;
  /** sm lab: Card + Wallet KPIs only, side by side — no total / upgrade / cash flow */
  smHeroKpisOnly?: boolean;
  /** Home-responsive xl: SVG stack clipped inside deck widget; right rail unchanged. */
  homeResponsiveSvgDeck?: boolean;
}) {
  const layout3TwoLeft = overviewLayout === "3" && layout3LeftColumns === 2;
  const [topCardOrderL3, setTopCardOrderL3] = useState<TopVariant2CardId[]>(() =>
    layout3TwoLeft ? ["balance", "spending", "card"] : loadTopVariant2Order(),
  );
  const [topCardOrderL2, setTopCardOrderL2] = useState<TopLayout2HeroId[]>(() => loadLayout2HeroOrder());
  const sensors = useDragSensors();
  const [activeTopId, setActiveTopId] = useState<TopVariant2CardId | TopLayout2HeroId | null>(null);

  useEffect(() => {
    if (activeTopId) {
      document.body.style.cursor = "grabbing";
    } else {
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.cursor = "";
    };
  }, [activeTopId]);

  const layout3TwoLeftDeckShellRef = useRef<HTMLDivElement | null>(null);
  const layout3SvgDeckShellRef = useRef<HTMLDivElement | null>(null);
  const layout3HeroBandTopRef = useRef<HTMLDivElement | null>(null);
  const layout3HeroBandBottomRef = useRef<HTMLDivElement | null>(null);
  const [layout3TwoLeftDeckHeightPx, setLayout3TwoLeftDeckHeightPx] = useState<number | null>(null);
  const [layout3SvgDeckPaintHeightPx, setLayout3SvgDeckPaintHeightPx] = useState<number | null>(
    null,
  );
  const [layout3HeroXl, setLayout3HeroXl] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setLayout3HeroXl(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    if (!layout3TwoLeft) {
      setLayout3TwoLeftDeckHeightPx(null);
      return;
    }
    const el = layout3TwoLeftDeckShellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setLayout3TwoLeftDeckHeightPx(Math.round(el.getBoundingClientRect().height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout3TwoLeft]);

  const measureLayout3SvgDeckHeight = useCallback(() => {
    if (!homeResponsiveSvgDeck || overviewLayout !== "3" || layout3TwoLeft) return;
    const topEl = layout3HeroBandTopRef.current;
    const bottomEl = layout3HeroBandBottomRef.current;
    if (!topEl || !bottomEl) return;
    const h = Math.round(bottomEl.getBoundingClientRect().bottom - topEl.getBoundingClientRect().top);
    if (h > 0) setLayout3SvgDeckPaintHeightPx(h);
  }, [homeResponsiveSvgDeck, overviewLayout, layout3TwoLeft]);

  const bindLayout3HeroBandTopRef = useCallback(
    (node: HTMLDivElement | null) => {
      layout3HeroBandTopRef.current = node;
      measureLayout3SvgDeckHeight();
    },
    [measureLayout3SvgDeckHeight],
  );

  const bindLayout3HeroBandBottomRef = useCallback(
    (node: HTMLDivElement | null) => {
      layout3HeroBandBottomRef.current = node;
      measureLayout3SvgDeckHeight();
    },
    [measureLayout3SvgDeckHeight],
  );

  useLayoutEffect(() => {
    if (!homeResponsiveSvgDeck || overviewLayout !== "3" || layout3TwoLeft) {
      setLayout3SvgDeckPaintHeightPx(null);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let ro: ResizeObserver | null = null;
    let retryCount = 0;

    const bindObservers = () => {
      const topEl = layout3HeroBandTopRef.current;
      const bottomEl = layout3HeroBandBottomRef.current;
      if (!topEl || !bottomEl || typeof ResizeObserver === "undefined") return;
      ro?.disconnect();
      ro = new ResizeObserver(measureLayout3SvgDeckHeight);
      ro.observe(topEl);
      ro.observe(bottomEl);
    };

    const tick = () => {
      if (cancelled) return;
      measureLayout3SvgDeckHeight();
      bindObservers();
      if (retryCount < 90) {
        retryCount += 1;
        rafId = requestAnimationFrame(tick);
      }
    };

    tick();
    window.addEventListener("resize", measureLayout3SvgDeckHeight);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener("resize", measureLayout3SvgDeckHeight);
    };
  }, [homeResponsiveSvgDeck, overviewLayout, layout3TwoLeft, measureLayout3SvgDeckHeight]);

  const {
    balance: overviewCardsUsdBalance,
    isOverlayLoading: overviewCardsOverlayLoading,
    primarySensitive: overviewPrimarySensitive,
  } = useAccountBalance();

  const dashboardRefresh = useDashboardRefreshOptional();
  const designSampleActive = useDesignSampleDataActive();
  const heroAmountBusy =
    (dashboardRefresh?.isRefreshing ?? false) ||
    (!designSampleActive && overviewCardsOverlayLoading);
  const cardUsageBusy =
    (dashboardRefresh?.isRefreshing ?? false) ||
    (!designSampleActive && overviewCardsOverlayLoading);
  const sampleCardBalancesAmount = 18_253.52;
  const sampleWalletBalancesAmount = 10_277.3;
  const sampleWeekSpend = 1284.5;
  const sampleSpentTotal = 2447.95;
  const cardBalancesAmount = designSampleActive ? sampleCardBalancesAmount : overviewCardsUsdBalance;
  const walletBalancesAmount = designSampleActive ? sampleWalletBalancesAmount : 0;
  const totalBalance = cardBalancesAmount + walletBalancesAmount;
  const weeklyLimit = designSampleActive ? 2500 : 0;
  const weekSpend = designSampleActive ? sampleWeekSpend : 0;
  const spentTotal = designSampleActive ? sampleSpentTotal : weekSpend;
  const { primaryDeck, rotatePrimaryDeck } = usePrimaryDeckStack();
  const [spendingLimitsModalOpen, setSpendingLimitsModalOpen] = useState(false);
  const [reloadModalOpen, setReloadModalOpen] = useState(false);
  const deckQuickActions = usePrimaryDeckQuickActions(newUserPrimaryCardCta);
  const spendingLimitsCardId = useMemo(
    () => resolveCardUsageLimitsCardId(primaryDeck),
    [primaryDeck],
  );

  useEffect(() => {
    if (overviewLayout !== "3" || layout3TwoLeft) return;
    try {
      window.localStorage.setItem(TOP_ROW_ORDER_STORAGE_KEY, JSON.stringify(topCardOrderL3));
    } catch {
      /* ignore */
    }
  }, [overviewLayout, layout3TwoLeft, topCardOrderL3]);

  useEffect(() => {
    if (overviewLayout !== "2") return;
    try {
      window.localStorage.setItem(TOP_LAYOUT2_HERO_ORDER_KEY, JSON.stringify(topCardOrderL2));
    } catch {
      /* ignore */
    }
  }, [overviewLayout, topCardOrderL2]);

  /**
   * Stable grid elements: rebuilding the whole tree every render + dnd-kit Always measuring can recurse setState
   * ("Maximum update depth exceeded"). DragOverlay uses `cloneElement` so it never shares the same element ref
   * as the grid (avoids dual-parenting) while keeping identity stable for sortables.
   */
  const balanceCardMemo = useMemo((): ReactElement<WidgetCardProps> => {
    const allocationRatio =
      cardBalancesAmount + walletBalancesAmount <= 0
        ? 0
        : cardBalancesAmount / (cardBalancesAmount + walletBalancesAmount);
    const allocationPct = Math.round(
      cardBalancesAmount + walletBalancesAmount <= 0
        ? 0
        : (100 * cardBalancesAmount) / (cardBalancesAmount + walletBalancesAmount),
    );

    const body = (
      <div className="flex min-h-0 w-full flex-1 flex-col justify-between gap-6">
        <HeroBalanceAmount busy={heroAmountBusy} className="shrink-0 text-[28px] sm:text-[32px]">
          {formatUsd(totalBalance)}
        </HeroBalanceAmount>
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center">
          <div className="w-full shrink-0 text-left">
            <div className="mb-3 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-white/42">
              Card vs wallet allocation
            </div>
            <SegmentedBarSparkline variant="dualPrimary" fillRatio={allocationRatio} className="mt-0" />
            <span className="sr-only">
              Card balances are about {allocationPct} percent of combined card plus wallet totals.
            </span>
          </div>
        </div>
        <div className="grid min-h-0 w-full shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
          <div className="min-w-0 rounded-[14px] bg-white/[0.04] px-3 py-3">
            <div className="text-[11px] font-medium text-white/60">Card Balances</div>
            <div className="mt-2 text-[17px] font-semibold tabular-nums tracking-tight text-white">
              {heroAmountBusy ? (
                <WalletSkeletonText className="text-[17px] font-semibold tabular-nums tracking-tight">
                  {formatUsd(cardBalancesAmount)}
                </WalletSkeletonText>
              ) : (
                formatUsd(cardBalancesAmount)
              )}
            </div>
          </div>
          <div className="min-w-0 rounded-[14px] bg-white/[0.04] px-3 py-3">
            <div className="text-[11px] font-medium text-white/60">Wallet Balances</div>
            <div className="mt-2 text-[17px] font-semibold tabular-nums tracking-tight text-white">
              {heroAmountBusy ? (
                <WalletSkeletonText className="text-[17px] font-semibold tabular-nums tracking-tight">
                  {formatUsd(walletBalancesAmount)}
                </WalletSkeletonText>
              ) : (
                formatUsd(walletBalancesAmount)
              )}
            </div>
          </div>
        </div>
      </div>
    );

    /** Narrow hero column: tighter bar + `p-4` shell via parent `contentClassName`. */
    const bodyCompact = (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <HeroBalanceAmount busy={heroAmountBusy} className="shrink-0 text-[22px] sm:text-[26px]">
          {formatUsd(totalBalance)}
        </HeroBalanceAmount>
        <div className="flex min-h-0 w-full flex-1 flex-col justify-center text-left">
          <div className="w-full shrink-0 pb-2">
            <div className="mb-2 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-white/42">
              Monthly spend limit
            </div>
            <SegmentedBarSparkline
              variant="dualPrimary"
              fillRatio={allocationRatio}
              pillarHeightPx={8}
              className="mt-0"
            />
            <span className="sr-only">
              Card balances are about {allocationPct} percent of combined card plus wallet totals.
            </span>
          </div>
        </div>
        <div className="min-h-0 w-full shrink-0">
          <div className="flex min-h-0 min-w-0 flex-col justify-center rounded-[14px] bg-white/[0.04] p-4">
            <div className="text-[11px] font-medium text-white/60">Card Balances</div>
            <div className="mt-1.5 text-[15px] font-semibold tabular-nums leading-none tracking-tight text-white sm:text-[16px]">
              {heroAmountBusy ? (
                <WalletSkeletonText className="text-[15px] font-semibold tabular-nums leading-none tracking-tight sm:text-[16px]">
                  {formatUsd(cardBalancesAmount)}
                </WalletSkeletonText>
              ) : (
                formatUsd(cardBalancesAmount)
              )}
            </div>
          </div>
        </div>
      </div>
    );

    if (overviewLayout === "2") {
      return (
        <WidgetCard title="Total balance" subtitle="App wide" fullHeight={true}>
          {body}
        </WidgetCard>
      );
    }

    if (layout3TwoLeft) {
      return (
        <WidgetCard
          title="Total balance"
          subtitle="App wide"
          fullHeight={true}
          contentClassName="min-h-0 !p-4 gap-4 [&>:first-child]:!mb-0 [&>:first-child]:shrink-0 [&>:last-child]:min-h-0 [&>:last-child]:flex-1"
        >
          {bodyCompact}
        </WidgetCard>
      );
    }

    const bodyLayout3 = (
      <HeroBalanceAmount busy={heroAmountBusy} className={HERO_SLIM_BALANCE_AMOUNT_CLASS}>
        {formatUsd(totalBalance)}
      </HeroBalanceAmount>
    );

    return (
      <WidgetCard
        title={<HeroSlimWidgetTitle longLabel="Total balance" shortLabel="Total" />}
        subtitle="App wide"
        fullHeight={false}
        className="w-full"
        headerTitleProps={HERO_SLIM_WIDGET_HEADER_TITLE_PROPS}
        contentClassName="flex min-h-0 flex-col gap-4 sm:gap-5 [&>:first-child]:!mb-0 [&>:first-child]:shrink-0"
      >
        {bodyLayout3}
      </WidgetCard>
    );
  }, [
    overviewLayout,
    layout3TwoLeft,
    totalBalance,
    cardBalancesAmount,
    walletBalancesAmount,
    heroAmountBusy,
  ]);

  const layout3CardUsageWidget = (
    <WidgetCard
      title="Card Usage"
      subtitle="Limits and spending"
      sampleDataLabel
      fullHeight={true}
      className={cn(
        "flex w-full min-h-[18rem] flex-col shadow-none ring-0 sm:min-h-[19rem] xl:min-h-[21rem]",
      )}
      contentClassName="flex min-h-0 flex-1 flex-col"
      status={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-0 bg-transparent transition-colors hover:bg-white/[0.05] sm:size-[30px]"
              aria-label="Card usage settings"
            >
              <Settings2
                className="size-3.5 text-[var(--color-text-primary)] opacity-70 transition-colors group-hover:text-white group-hover:opacity-100"
                strokeWidth={1.75}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className={cn(WALLET_GLASS_MENU_CONTENT, "!min-w-0 !grid !gap-1 !p-1")}
          >
            <DropdownMenuItem
              className={cn(WALLET_GLASS_MENU_ITEM_ROW_BASE, WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL)}
              onSelect={() => setSpendingLimitsModalOpen(true)}
            >
              Spending limits
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <CardUsageLimitsPanel
        busy={cardUsageBusy}
        fillTallShell
        data={
          designSampleActive
            ? CARD_USAGE_MOCK_DATA[primaryDeck[0]?.id ?? "c1"]
            : EMPTY_CARD_USAGE_DATA
        }
      />
    </WidgetCard>
  );

  const layout3RightRail =
    overviewLayout === "3" && !layout3TwoLeft ? (
      <div
        className={cn(
          "hidden min-h-0 shrink-0 flex-col xl:col-span-4 xl:col-start-9 xl:row-start-3 xl:flex",
          LAYOUT3_HERO_GUTTER_CLASS,
        )}
      >
        <Layout3DeckQuickActionsBar
          deckActionsEnabled={deckQuickActions.deckActionsEnabled}
          onReload={() => {
            if (newUserPrimaryCardCta) setReloadModalOpen(true);
            else deckQuickActions.setReloadModalOpen(true);
          }}
          onWithdraw={() => deckQuickActions.setWithdrawModalOpen(true)}
          onActivity={() => deckQuickActions.setActivityModalOpen(true)}
        />
        <DemoSurfaceRegion
          className="w-full shrink-0 self-start [&>div]:!h-auto [&>div]:min-h-0 [&>div]:shrink-0 [&>div]:flex-none"
          showActions
        >
          {layout3CardUsageWidget}
        </DemoSurfaceRegion>
      </div>
    ) : null;

  const primaryCardMemo = useMemo((): ReactElement => {
    const deckStack = (
      <VariantPrimaryDeckStack
        deck={primaryDeck}
        onRotate={rotatePrimaryDeck}
        hookUsdBalance={overviewCardsUsdBalance}
        hookSensitive={overviewPrimarySensitive}
        hookOverlayLoading={
          overviewCardsOverlayLoading || (dashboardRefresh?.isRefreshing ?? false)
        }
        expandToCell={overviewLayout === "3"}
        newUserPrimaryCardCta={newUserPrimaryCardCta}
        suppressQuickActionsBar={overviewLayout === "3"}
        nuroCodeCardStack={homeResponsiveSvgDeck}
        svgDeckPaintHeightPx={layout3SvgDeckPaintHeightPx}
        deckQuickActions={deckQuickActions}
        sharedReloadModal={
          newUserPrimaryCardCta
            ? { open: reloadModalOpen, onOpenChange: setReloadModalOpen }
            : undefined
        }
      />
    );

    if (overviewLayout === "3") {
      const layout3MobileRightColumn = (
        <>
          {deckStack}
          <Layout3DeckQuickActionsBar
            deckActionsEnabled={deckQuickActions.deckActionsEnabled}
            onReload={() => {
              if (newUserPrimaryCardCta) setReloadModalOpen(true);
              else deckQuickActions.setReloadModalOpen(true);
            }}
            onWithdraw={() => deckQuickActions.setWithdrawModalOpen(true)}
            onActivity={() => deckQuickActions.setActivityModalOpen(true)}
          />
          <DemoSurfaceRegion
            className="w-full shrink-0 self-start [&>div]:!h-auto [&>div]:min-h-0 [&>div]:shrink-0 [&>div]:flex-none"
            showActions
          >
            {layout3CardUsageWidget}
          </DemoSurfaceRegion>
        </>
      );

      return (
        <>
          <WidgetCard
            hideHeader
            headerDragOverlay
            title=""
            fullHeight={false}
            flushContent={homeResponsiveSvgDeck}
            className={cn(
              "hidden w-full bg-transparent dark:bg-transparent dark:backdrop-blur-none xl:block",
              homeResponsiveSvgDeck
                ? "!h-auto !min-h-0 !shrink-0 overflow-hidden shadow-none ring-0"
                : "min-h-0 shadow-none ring-0 !overflow-visible",
            )}
            contentClassName={
              homeResponsiveSvgDeck
                ? "block w-full shrink-0 overflow-hidden"
                : "relative flex min-h-0 w-full shrink-0 flex-col justify-end overflow-visible !p-0"
            }
          >
            {deckStack}
          </WidgetCard>
          <WidgetCard
            hideHeader
            headerDragOverlay
            title=""
            fullHeight={false}
            className={cn(
              "bg-transparent dark:bg-transparent dark:backdrop-blur-none xl:hidden",
              "shadow-none ring-0 !overflow-visible",
            )}
          contentClassName={cn(
            "relative flex min-h-0 flex-col overflow-visible !p-0",
            LAYOUT3_HERO_GUTTER_CLASS,
          )}
        >
          {layout3MobileRightColumn}
          </WidgetCard>
        </>
      );
    }

    return (
      <WidgetCard title="Primary card" fullHeight={true}>
        <div className="relative flex min-h-0 flex-1 flex-shrink-0 flex-col justify-end">
          {deckStack}
        </div>
      </WidgetCard>
    );
  }, [
    overviewLayout,
    primaryDeck,
    rotatePrimaryDeck,
    overviewCardsUsdBalance,
    overviewPrimarySensitive,
    overviewCardsOverlayLoading,
    dashboardRefresh?.isRefreshing,
    cardUsageBusy,
    setSpendingLimitsModalOpen,
    newUserPrimaryCardCta,
    reloadModalOpen,
    setReloadModalOpen,
    designSampleActive,
    deckQuickActions,
    layout3CardUsageWidget,
    homeResponsiveSvgDeck,
    layout3SvgDeckPaintHeightPx,
  ]);

  const spendingCardMemo = useMemo((): ReactElement<WidgetCardProps> => {
    const pct = Math.max(0, Math.min(1, weekSpend / weeklyLimit));
    const donutData = [
      { name: "Outcome", value: 44, color: "var(--color-text-primary)" },
      { name: "Income", value: 38, color: "var(--color-primary)" },
      { name: "Others", value: 18, color: "var(--color-text-muted)" },
    ];
    const body = (
      <div className="flex h-full min-h-0 w-full flex-col items-center gap-4 sm:gap-4 md:flex-row md:items-stretch md:justify-between">
        <div className="flex shrink-0 items-center md:items-center md:self-stretch">
          <SpendingDonut data={donutData} centerTop="Spent" centerBottom={formatUsd(spentTotal)} />
        </div>

        <div className="flex w-full min-w-0 flex-1 flex-col justify-between gap-3 md:min-h-0">
          <div className="grid min-w-0 grid-cols-1 gap-2 text-[10px] font-medium sm:grid-cols-3">
            <div className="min-w-0 overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.04] px-2 py-2.5 sm:px-3">
              <div className="truncate text-[var(--color-text-muted)]">Limit</div>
              <div className="mt-1 truncate text-[11px] font-semibold tabular-nums leading-none text-[var(--color-text-primary)] sm:text-[12px]">
                {formatUsdCompact(weeklyLimit)}
              </div>
            </div>
            <div className="min-w-0 overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.04] px-2 py-2.5 sm:px-3">
              <div className="truncate text-[var(--color-text-muted)]">Used</div>
              <div className="mt-1 truncate text-[11px] font-semibold tabular-nums leading-none text-[var(--color-text-primary)] sm:text-[12px]">
                {formatUsdCompact(weekSpend)}
              </div>
            </div>
            <div className="min-w-0 overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.04] px-2 py-2.5 sm:px-3">
              <div className="truncate text-[var(--color-text-muted)]">Remain</div>
              <div className="mt-1 truncate text-[11px] font-semibold tabular-nums leading-none text-[var(--color-text-primary)] sm:text-[12px]">
                {formatUsdCompact(Math.max(0, weeklyLimit - weekSpend))}
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-[var(--color-text-muted)]">Weekly budget</span>
              <span className={cn(pct >= 0.9 ? "text-[var(--color-warning)]" : "text-[var(--color-success)]")}>
                {(pct * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className={cn(
                  "h-full rounded-full",
                  pct >= 0.9 ? "bg-[var(--color-warning)]/70" : "bg-[var(--color-primary)]/70"
                )}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
            <div className="mt-1.5 text-[10px] font-medium text-[var(--color-text-muted)]">
              Weekly spending limit is {formatUsd(weeklyLimit)}.
            </div>
          </div>
        </div>
      </div>
    );

    if (overviewLayout === "2") {
      return (
        <WidgetCard
          title="Wallet balances"
          subtitle="All wallets"
          fullHeight={true}
        >
          {body}
        </WidgetCard>
      );
    }

    const bodyLayout3 = (
      <HeroBalanceAmount
        busy={heroAmountBusy}
        className={smHeroKpisOnly ? HERO_SM_KPI_AMOUNT_CLASS : HERO_SLIM_BALANCE_AMOUNT_CLASS}
      >
        {formatUsd(walletBalancesAmount)}
      </HeroBalanceAmount>
    );

    return (
      <WidgetCard
        title={
          <HeroSlimWidgetTitle
            longLabel="Wallet balances"
            shortLabel="Wallets"
            forceShort={smHeroKpisOnly}
          />
        }
        subtitle="All wallets"
        fullHeight={false}
        className="w-full"
        headerTitleProps={
          smHeroKpisOnly ? HERO_SM_KPI_HEADER_TITLE_PROPS : HERO_SLIM_WIDGET_HEADER_TITLE_PROPS
        }
        contentClassName="flex min-h-0 flex-col gap-4 sm:gap-5 [&>:first-child]:!mb-0 [&>:first-child]:shrink-0"
      >
        {bodyLayout3}
      </WidgetCard>
    );
  }, [
    overviewLayout,
    cardBalancesAmount,
    walletBalancesAmount,
    weekSpend,
    weeklyLimit,
    spentTotal,
    heroAmountBusy,
    smHeroKpisOnly,
  ]);

  const insightCardMemo = useMemo((): ReactElement<WidgetCardProps> => {
    if (overviewLayout !== "3") {
      return (
        <WidgetCard title="Card balances" subtitle="All cards" fullHeight={true}>
          <div className="min-h-0 flex-1" aria-hidden />
        </WidgetCard>
      );
    }

    return (
      <WidgetCard
        title={
          <HeroSlimWidgetTitle
            longLabel="Card balances"
            shortLabel="Cards"
            forceShort={smHeroKpisOnly}
          />
        }
        subtitle="All cards"
        fullHeight={false}
        className="w-full"
        headerTitleProps={
          smHeroKpisOnly ? HERO_SM_KPI_HEADER_TITLE_PROPS : HERO_SLIM_WIDGET_HEADER_TITLE_PROPS
        }
        contentClassName="flex min-h-0 flex-col gap-4 sm:gap-5 [&>:first-child]:!mb-0 [&>:first-child]:shrink-0"
      >
        <HeroBalanceAmount
          busy={heroAmountBusy}
          className={smHeroKpisOnly ? HERO_SM_KPI_AMOUNT_CLASS : HERO_SLIM_BALANCE_AMOUNT_CLASS}
        >
          {formatUsd(cardBalancesAmount)}
        </HeroBalanceAmount>
      </WidgetCard>
    );
  }, [overviewLayout, cardBalancesAmount, heroAmountBusy, smHeroKpisOnly]);

  const gridCardById = useCallback(
    (id: TopVariant2CardId): ReactElement => {
      switch (id) {
        case "balance":
          return balanceCardMemo;
        case "card":
          return primaryCardMemo;
        case "insight":
          return insightCardMemo;
        case "spending":
          return spendingCardMemo;
        default:
          return balanceCardMemo;
      }
    },
    [balanceCardMemo, insightCardMemo, spendingCardMemo, primaryCardMemo],
  );

  const topIdsL3 = useMemo(() => topCardOrderL3.filter((id) => id !== "card"), [topCardOrderL3]);
  const topIdsL2 = useMemo(() => topCardOrderL2.filter((id) => id !== "card"), [topCardOrderL2]);

  const handleTopDragStart = useCallback(
    (e: DragStartEvent) => {
      const aid = e.active.id;
      if (overviewLayout === "3") {
        if (typeof aid === "string" && isTopVariant2CardId(aid) && topCardOrderL3.includes(aid)) {
          setActiveTopId(aid);
        } else {
          setActiveTopId(null);
        }
      } else {
        if (typeof aid === "string" && isTopLayout2HeroId(aid) && topCardOrderL2.includes(aid)) {
          setActiveTopId(aid);
        } else {
          setActiveTopId(null);
        }
      }
    },
    [overviewLayout, topCardOrderL3, topCardOrderL2],
  );

  const handleTopDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over) {
        setActiveTopId(null);
        return;
      }

      if (overviewLayout === "3") {
        if (!isTopVariant2CardId(active.id) || !isTopVariant2CardId(over.id)) {
          setActiveTopId(null);
          return;
        }
        if (active.id === over.id) {
          setActiveTopId(null);
          return;
        }
        setTopCardOrderL3((prev) => {
          const oldIndex = prev.indexOf(active.id as TopVariant2CardId);
          const newIndex = prev.indexOf(over.id as TopVariant2CardId);
          if (oldIndex < 0 || newIndex < 0) return prev;
          return pinDeckLast(arrayMove(prev, oldIndex, newIndex));
        });
      } else {
        if (!isTopLayout2HeroId(active.id) || !isTopLayout2HeroId(over.id)) {
          setActiveTopId(null);
          return;
        }
        if (active.id === over.id) {
          setActiveTopId(null);
          return;
        }
        setTopCardOrderL2((prev) => {
          const oldIndex = prev.indexOf(active.id as TopLayout2HeroId);
          const newIndex = prev.indexOf(over.id as TopLayout2HeroId);
          if (oldIndex < 0 || newIndex < 0) return prev;
          return pinDeckLastLayout2(arrayMove(prev, oldIndex, newIndex));
        });
      }
      setActiveTopId(null);
    },
    [overviewLayout],
  );

  const handleTopDragCancel = useCallback(() => {
    setActiveTopId(null);
  }, []);

  if (overviewLayout === "3" && smHeroKpisOnly) {
    return (
      <div className={cn("flex w-full min-w-0 flex-col", LAYOUT3_HERO_GUTTER_CLASS)}>
        <div className="grid w-full grid-cols-2 gap-3">
          {insightCardMemo}
          {spendingCardMemo}
        </div>
        <DemoSurfaceRegion showActions>
          <HeroCashFlowPanel />
        </DemoSurfaceRegion>
      </div>
    );
  }

  if (overviewLayout === "2") {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
            frequency: MeasuringFrequency.Optimized,
          },
        }}
        onDragStart={handleTopDragStart}
        onDragEnd={handleTopDragEnd}
        onDragCancel={handleTopDragCancel}
      >
        <SortableContext items={topIdsL2} strategy={rectSortingStrategy}>
          <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-12 xl:items-stretch">
            {topCardOrderL2
              .filter((id): id is "balance" | "spending" => id !== "card")
              .map((id) => (
                <Variant2TopSortableShell key={id} id={id} heroSlot="slim" slimFlat>
                  {gridCardById(id)}
                </Variant2TopSortableShell>
              ))}
            <Variant2TopSortableShell key="card" id="card" heroSlot="deck" disabled>
              {gridCardById("card")}
            </Variant2TopSortableShell>
          </div>
        </SortableContext>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null} zIndex={9999}>
              {activeTopId ? cloneElement(gridCardById(activeTopId as TopVariant2CardId), { key: `v2-drag-overlay:${activeTopId}` }) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
          frequency: MeasuringFrequency.Optimized,
        },
      }}
      onDragStart={handleTopDragStart}
      onDragEnd={handleTopDragEnd}
      onDragCancel={handleTopDragCancel}
    >
      <SortableContext items={topIdsL3} strategy={rectSortingStrategy}>
        <div
          className={cn(
            "grid w-full grid-cols-1 xl:grid-cols-12 xl:items-stretch",
            overviewLayout === "3" && !layout3TwoLeft
              ? cn(
                  LAYOUT3_HERO_GUTTER_CLASS,
                  "min-h-0 xl:grid-rows-[auto_auto_minmax(0,1fr)] xl:items-start",
                )
              : overviewLayout === "3"
                ? "gap-4 min-h-0"
                : "gap-4",
          )}
        >
          {newUserPrimaryCardCta ? (
            <div
              ref={bindLayout3HeroBandTopRef}
              className={cn(
                "relative grid min-h-0 min-w-0 grid-cols-1 gap-4 self-stretch xl:col-span-8 xl:h-full",
                "xl:grid-rows-[auto_auto_minmax(0,1fr)]",
              )}
            >
              <div
                ref={bindLayout3HeroBandBottomRef}
                className={cn(
                  "grid min-w-0 shrink-0 grid-cols-1 gap-4 xl:col-span-1 xl:row-span-2 xl:row-start-1 xl:grid-cols-2 xl:items-start xl:self-start",
                  overviewLayout === "3" && "min-h-0 min-w-0",
                )}
              >
                <NewUserOnboardingSteps onDeposit={() => setReloadModalOpen(true)} />
              </div>
              <DemoSurfaceRegion
                className="hidden min-h-0 min-w-0 xl:row-start-3 xl:block xl:h-full xl:min-h-0"
                showActions
              >
                <HeroCashFlowPanel />
              </DemoSurfaceRegion>
            </div>
          ) : layout3TwoLeft ? (
            <div
              className={cn(
                "grid min-h-0 min-w-0 grid-cols-1 gap-4 self-stretch xl:col-span-8 xl:grid-rows-1 xl:items-stretch",
                "xl:grid-cols-2 [&>*]:min-h-0",
                overviewLayout === "3" && "h-full",
              )}
              style={
                layout3HeroXl && layout3TwoLeftDeckHeightPx != null
                  ? { height: layout3TwoLeftDeckHeightPx }
                  : undefined
              }
            >
              {topCardOrderL3
                .filter((id): id is TopHeroSmallSlotId => id !== "card")
                .map((id) => (
                  <Variant2TopSortableShell
                    key={id}
                    id={id}
                    heroSlot="slim"
                    slimAutoHeight={false}
                  >
                    {gridCardById(id)}
                  </Variant2TopSortableShell>
                ))}
            </div>
          ) : (
            <>
              <div
                ref={bindLayout3HeroBandTopRef}
                className={cn(
                  "grid min-w-0 shrink-0 grid-cols-1 md:grid-cols-3 xl:col-span-8 xl:row-start-1 xl:grid-cols-3 xl:items-start xl:self-start",
                  LAYOUT3_HERO_GUTTER_CLASS,
                  "min-h-0 min-w-0",
                )}
              >
                {topCardOrderL3
                  .filter((id): id is TopHeroSmallSlotId => id !== "card")
                  .map((id) => (
                    <Variant2TopSortableShell
                      key={id}
                      id={id}
                      heroSlot="slim"
                      slimAutoHeight
                    >
                      {gridCardById(id)}
                    </Variant2TopSortableShell>
                  ))}
              </div>
              <div
                ref={bindLayout3HeroBandBottomRef}
                className={cn(
                  "relative w-full shrink-0 overflow-hidden xl:col-span-8 xl:row-start-2 xl:self-start",
                  "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]",
                )}
              >
                <div className="flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-[16px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[18px]">
                      Upgrade Your Account
                    </h1>
                    <h2
                      className={cn(
                        WIDGET_HEADER_TITLE_SUBTITLE_GAP_CLASS,
                        "text-[11px] font-normal leading-snug text-[var(--color-text-muted)] sm:text-[13px] min-[768px]:max-[1023px]:whitespace-nowrap",
                      )}
                    >
                      <span className="hidden min-[768px]:max-[1023px]:inline">
                        More cards, lower fees
                      </span>
                      <span className="inline min-[768px]:max-[1023px]:hidden">
                        More cards, lower fees, better control
                      </span>
                    </h2>
                  </div>
                  <HeroKycFinishButton />
                </div>
              </div>
              <DemoSurfaceRegion
                className="min-h-0 min-w-0 xl:col-span-8 xl:row-start-3 xl:h-full xl:min-h-0 xl:self-stretch"
                showActions
              >
                <HeroCashFlowPanel />
              </DemoSurfaceRegion>
            </>
          )}
          {!hidePrimaryDeck ? (
            <Variant2TopSortableShell
              key="card"
              id="card"
              heroSlot="deck"
              disabled
              deckAutoHeight={homeResponsiveSvgDeck}
              shellClassName={
                layout3TwoLeft
                  ? "xl:!h-auto xl:self-start"
                  : overviewLayout === "3"
                    ? homeResponsiveSvgDeck
                      ? "xl:!h-auto xl:self-start xl:col-start-9 xl:row-span-3 xl:row-start-1 xl:min-h-0 xl:overflow-hidden"
                      : "xl:col-start-9 xl:row-span-3 xl:row-start-1 xl:self-end [&>div]:!h-auto [&>div]:min-h-0"
                    : undefined
              }
              shellCallbackRef={(node) => {
                layout3TwoLeftDeckShellRef.current = node;
                layout3SvgDeckShellRef.current = node;
                measureLayout3SvgDeckHeight();
              }}
            >
              {gridCardById("card")}
            </Variant2TopSortableShell>
          ) : null}
          {!hidePrimaryDeck ? layout3RightRail : null}
        </div>
      </SortableContext>

      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={null} zIndex={9999}>
            {activeTopId ? cloneElement(gridCardById(activeTopId as TopVariant2CardId), { key: `v3-drag-overlay:${activeTopId}` }) : null}
          </DragOverlay>,
          document.body
        )}
      <CardSpendingLimitsModal
        open={spendingLimitsModalOpen}
        onOpenChange={setSpendingLimitsModalOpen}
        cardId={spendingLimitsCardId}
      />
      {newUserPrimaryCardCta ? (
        <ReloadModal open={reloadModalOpen} onOpenChange={setReloadModalOpen} />
      ) : null}
    </DndContext>
  );
}

