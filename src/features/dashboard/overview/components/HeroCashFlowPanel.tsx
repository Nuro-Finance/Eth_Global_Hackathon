"use client";

import { useMemo, useId, useState, useEffect, type CSSProperties } from "react";
import { IconChartBar, IconChevronDown, IconGraph } from "@tabler/icons-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
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
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import { Check } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { formatUsd, formatUsdCompact } from "../layouts/OverviewVariants/overviewVariantUtils";
import { OVERVIEW_HEADER_PILL_BUTTON_CLASSNAME } from "../shared";
import { useDesignSampleDataActive } from "../hooks/designSampleData";
import { SampleDataLabel } from "./SampleDataLabel";
import { useCashFlowData } from "../hooks/useCashFlowData";
import { WalletSkeletonText } from "@/features/dashboard/my-wallet/WalletDataSkeletons";
import { useDashboardRefreshOptional } from "../layouts/DashboardGrid/context/DashboardRefreshContext";

type CashTab = "income" | "expense";
type ChartMode = "bar" | "area";

/**
 * Default axis + scale (mock-data scale). Used when sample explorer is active.
 * Real-data mode (sample cleared + useCashFlowData returning real values) uses
 * `computeYAxisFromData()` below to scale labels to the actual data range -
 * was hardcoded to $0–$6K which made $200 real bars overflow the $2 tick line.
 */
function formatAxisTick(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${v}`;
}

function buildYAxisLabels(niceMax: number): readonly string[] {
  const tick3 = niceMax;
  const tick2 = Math.round((niceMax * 2) / 3);
  const tick1 = Math.round(niceMax / 3);
  return [formatAxisTick(tick3), formatAxisTick(tick2), formatAxisTick(tick1), "$0"];
}

const CHART_MAX = 6000;

/**
 * Phase 3 surgical (2026-05-25): pick a nice round axis max + 4 evenly-spaced
 * labels for whatever the current income/expense data range is. Keeps both
 * tabs (income + expense) on the same scale so toggling doesn't shift the axis.
 *
 * Behavior:
 * - All zeros (new user) → return default $0–$6K so chart shape stays
 * - Up to $100 → step $25 ($25, $50, $75, $100)
 * - Up to $500 → step $100
 * - Up to $1K → step $250
 * - Up to $5K → step $1K
 * - Above → step $2K
 */
function computeYAxisFromData(allValues: readonly number[]): { max: number; labels: readonly string[] } {
  const dataMax = allValues.reduce((m, v) => (v > m ? v : m), 0);
  if (dataMax === 0) {
    return { max: CHART_MAX, labels: buildYAxisLabels(CHART_MAX) };
  }
  let step: number;
  if (dataMax < 100) step = 25;
  else if (dataMax < 500) step = 100;
  else if (dataMax < 1000) step = 250;
  else if (dataMax < 5000) step = 1000;
  else step = 2000;
  const niceMax = Math.ceil(dataMax / step) * step;
  return {
    max: niceMax,
    labels: buildYAxisLabels(niceMax),
  };
}

const CHART_DATA_INCOME: Record<string, readonly number[]> = {
  Daily: [800, 4200, 600, 500, 450, 700, 3800, 500, 600, 400, 3900],
  Weekly: [3200, 3500, 3100, 3800, 3400, 4100, 3700, 4400, 4000, 4800, 4500],
  Monthly: [4800, 4900, 5100, 5400, 5600, 5900, 5700, 5800, 5950, 5850, 5900],
};

const CHART_DATA_EXPENSE: Record<string, readonly number[]> = {
  Daily: [1200, 1500, 2800, 1100, 1400, 3200, 1300, 1600, 2900, 1200, 1500],
  Weekly: [2200, 2400, 2100, 2600, 2300, 2800, 2500, 3100, 2700, 3400, 2900],
  Monthly: [3200, 3300, 3500, 3800, 3600, 4100, 3900, 4400, 4200, 4700, 4500],
};

const BAR_VALUES_INCOME = CHART_DATA_INCOME.Weekly;
const BAR_VALUES_EXPENSE = CHART_DATA_EXPENSE.Weekly;

const BAR_VALUES_BY_TAB = {
  income: BAR_VALUES_INCOME,
  expense: BAR_VALUES_EXPENSE,
} as const;

/** Index of today / current period - last datum before trailing empty column. */
const DEFAULT_SELECTED_BAR_IDX = BAR_VALUES_INCOME.length - 2;

/**
 * Gray bar **fills** (`BAR_BG_GRAY` + hatch) - unchanged here. Heel dissolve is **`mask-image` alpha only** below.
 */
const BAR_BG_GRAY =
  "linear-gradient(180deg, color-mix(in oklab, white 16%, var(--color-bg-card)) 0%, color-mix(in oklab, white 9.5%, var(--color-bg-card)) 3.35%, color-mix(in oklab, white 7.15%, var(--color-bg-card)) 6.75%, color-mix(in oklab, white 6.25%, var(--color-bg-card)) 11%, color-mix(in oklab, white 2.25%, var(--color-bg-card)) 42%, color-mix(in oklab, black 3%, var(--color-bg-card)) 72%, color-mix(in oklab, black 7.5%, var(--color-bg-card)) 100%)";

/** Thin diagonal stripes (-33°); opacity as before subtle hatch pass. */
const BAR_GRAY_DIAGONAL_HATCH =
  "repeating-linear-gradient(-33deg, transparent 0px, transparent 5px, rgba(255,255,255,0.028) 5px, rgba(255,255,255,0.028) 6px)";

const BAR_INACTIVE_GRAY_FILL = `${BAR_GRAY_DIAGONAL_HATCH}, ${BAR_BG_GRAY}`;

const BAR_GRAY_VERTICAL_OPACITY_MASK =
  "linear-gradient(180deg, #ffffff 0%, #ffffff 58%, #000000 100%)";

const BAR_HEEL_MASK_FILL_ONLY = {
  WebkitMaskImage: BAR_GRAY_VERTICAL_OPACITY_MASK,
  maskImage: BAR_GRAY_VERTICAL_OPACITY_MASK,
 /** Stretch + anchor bottom so α→0 spills past layout box edge (drops hard cut with `boxShadow`). */
  WebkitMaskSize: "100% 135%",
  maskSize: "100% 135%",
  WebkitMaskPosition: "center bottom",
  maskPosition: "center bottom",
  WebkitMaskRepeat: "no-repeat" as const,
  maskRepeat: "no-repeat" as const,
  WebkitMaskMode: "luminance",
  maskMode: "luminance",
} as const;

const BAR_INACTIVE_GRAY_MASK_STYLE = {
  backgroundImage: BAR_INACTIVE_GRAY_FILL,
  ...BAR_HEEL_MASK_FILL_ONLY,
};

/** ±1 from focus bar: muted primary over gray (still subtle). ±2: lighter wash. Uses same token family as highlighted fill. */
const BAR_NEIGHBOR_WASH_DISTANCE_1 =
  "linear-gradient(180deg, color-mix(in oklab, var(--color-primary) 25%, transparent) 0%, color-mix(in oklab, var(--color-primary) 12%, transparent) 52%, color-mix(in oklab, var(--color-primary) 6%, transparent) 100%)";

const BAR_NEIGHBOR_WASH_DISTANCE_2 =
  "linear-gradient(180deg, color-mix(in oklab, var(--color-primary) 5%, transparent) 0%, color-mix(in oklab, var(--color-primary) 2.25%, transparent) 68%, transparent 100%)";

function inactiveGrayStyleForNeighborDistance(distance: number): CSSProperties {
  if (distance !== 1 && distance !== 2) return BAR_INACTIVE_GRAY_MASK_STYLE;
  const wash =
    distance === 1 ? BAR_NEIGHBOR_WASH_DISTANCE_1 : BAR_NEIGHBOR_WASH_DISTANCE_2;
  return {
    ...BAR_INACTIVE_GRAY_MASK_STYLE,
    backgroundImage: `${wash}, ${BAR_INACTIVE_GRAY_FILL}`,
  };
}

const BAR_BG_PRIMARY =
  "linear-gradient(180deg, color-mix(in oklab, var(--color-primary) 32%, white 68%) 0%, var(--color-primary) 32%, color-mix(in oklab, var(--color-primary) 50%, var(--color-bg-card)) 58%, var(--color-bg-card) 100%)";

const BAR_ACTIVE_SHADOW =
  "0 -10px 18px color-mix(in oklab, var(--color-primary) 38%, transparent)";

/** Income - product blue lane (explicit for consistency across themes). */
const INCOME_BLUE = "#0D90FF";

/** Expense stroke/fill - token mix you already had (no unsolicited hex swaps). SVG-safe via color-mix. */
const EXPENSE_SOFT_GRAY_BLUE =
  "color-mix(in oklab, var(--color-primary, #0D90FF) 55%, #ffffff 45%)";

const AREA_STROKE_WIDTH = 1.85;

/** Dense samples feed `monotone` so paths stay curved & smooth yet still undulate between weeks. */
const AREA_SAMPLES_PER_GAP = 20;

/** Chord perturbation amplitude (still anchored to 0 at each weekly knot). */
const AREA_WOBBLE_OF_BRIDGE = 0.075;

/** Extra crest/trough articulation on the blue trace only. */
const INCOME_RIPPLE_FACTOR = 1.52;

/** Tooltip series marker: small square (≈8px) with softened corners - not a circle. */
const SERIES_SWATCH_CLASS =
  "h-2 w-2 shrink-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]";

/** Lighter frost than `--glass-blur`: keeps labels legible behind bar tooltips. */
const TOOLTIP_BACKDROP_BLUR_CLASS = "dark:backdrop-blur-[10px]";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

type CashFlowWeeklyAnchor = {
  labelShort: string;
  labelLong: string;
  income: number;
  expense: number;
  barIndex: number;
};

/** Plotted vertices for Recharts Area (fractional weeks on X); tooltip snaps to anchors. */
type CashFlowAreaPoint = {
  weekX: number;
  income: number;
  expense: number;
  tooltipIncome: number;
  tooltipExpense: number;
  labelLong: string;
  barIndex: number;
};

/** Smooth eased progress between anchors (underlying shape), before ripple additive. */
function smoother01(tRaw: number) {
  const t = Math.min(1, Math.max(0, tRaw));
  return t * t * (3 - 2 * t);
}

// Phase 3 surgical wire (2026-05-25): incomeData / expenseData now passed in
// from the component. Callers pick mock CHART_DATA_INCOME/EXPENSE (sample
// explorer mode) vs real useCashFlowData() output (sample cleared / real user
// view). The helper stays pure - only consumes whatever arrays it's handed.
function buildCashFlowWeeklyAnchors(
  range: "Daily" | "Weekly" | "Monthly",
  incomeData: readonly number[],
  expenseData: readonly number[],
): CashFlowWeeklyAnchor[] {
  const rows: CashFlowWeeklyAnchor[] = [];
  const base = new Date(2025, 0, 5);
  for (let i = 1; i < BAR_VALUES_INCOME.length - 1; i++) {
    const d = new Date(base);
    if (range === "Daily") {
      d.setDate(d.getDate() + (i - 1));
    } else if (range === "Weekly") {
      d.setDate(d.getDate() + (i - 1) * 7);
    } else {
      d.setMonth(d.getMonth() + (i - 1));
    }
    const mIdx = d.getMonth();
    const dayNum = d.getDate();

    let labelShort = "";
    if (range === "Daily") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      labelShort = `${days[d.getDay()]} ${pad2(dayNum)}`;
    } else if (range === "Weekly") {
      labelShort = `${MONTHS_SHORT[mIdx]} ${pad2(dayNum)}`;
    } else {
      labelShort = `${MONTHS_SHORT[mIdx]}`;
    }

    rows.push({
      labelShort,
      labelLong: `${MONTHS_LONG[mIdx]} ${dayNum} ${d.getFullYear()}`,
      income: incomeData[i] ?? 0,
      expense: expenseData[i] ?? 0,
      barIndex: i,
    });
  }
  return rows;
}

function densifyWeeklyCashFlowAnchors(
  weekly: CashFlowWeeklyAnchor[],
): CashFlowAreaPoint[] {
  const W = weekly.length;
  if (W < 2) return [];

  const out: CashFlowAreaPoint[] = [];
  const twoPi = Math.PI * 2;

  const steps = Math.max(2, AREA_SAMPLES_PER_GAP);

  const clampSpend = (nVal: number) =>
    Math.min(CHART_MAX * 0.992, Math.max(360, nVal));

  for (let iw = 0; iw < W - 1; iw++) {
    const A = weekly[iw]!;
    const B = weekly[iw + 1]!;
    const startSeg = iw === 0 ? 0 : 1;

    for (let s = startSeg; s <= steps; s++) {
      const rawT = steps === 0 ? 0 : s / steps;
      const st = smoother01(rawT);
      const envelope = Math.sin(Math.PI * rawT);

      const weekFloat = iw + rawT;

      let income = A.income + st * (B.income - A.income);
      let expense = A.expense + st * (B.expense - A.expense);

      const bridgeI = Math.abs(B.income - A.income);
      const bridgeE = Math.abs(B.expense - A.expense);
      const ampI = Math.min(
        128,
        Math.max(22, bridgeI * AREA_WOBBLE_OF_BRIDGE * INCOME_RIPPLE_FACTOR),
      );
      const ampE = Math.min(76, Math.max(14, bridgeE * AREA_WOBBLE_OF_BRIDGE));

 /** Income: denser harmonic stack → visible peaks/troughs; expense unchanged vs your palette. */
      const wI =
        0.38 * Math.sin(weekFloat * twoPi * (3.85 + iw * 0.05)) +
        0.28 * Math.sin(weekFloat * twoPi * (6.15 - iw * 0.035) + 0.52) +
        0.2 * Math.sin(weekFloat * twoPi * (9.05 + iw * 0.03) - 0.44) +
        0.16 * Math.sin(weekFloat * twoPi * (12.55 - iw * 0.018) + 0.73);
      const wE =
        0.48 * Math.sin(weekFloat * twoPi * 3.55 - iw * 0.05) +
        0.34 * Math.sin(weekFloat * twoPi * (6.05 + iw * 0.045) + 0.72) +
        0.2 * Math.sin(weekFloat * twoPi * (8.9 - iw * 0.02) - 0.33);

      income += ampI * wI * envelope * 0.62;
      expense += ampE * wE * envelope * 0.44;

      const snapIdx = Math.min(W - 1, Math.max(0, Math.round(weekFloat)));
      const snap = weekly[snapIdx]!;

      out.push({
        weekX: weekFloat,
        income: clampSpend(income),
        expense: clampSpend(expense),
        tooltipIncome: snap.income,
        tooltipExpense: snap.expense,
        labelLong: snap.labelLong,
        barIndex: snap.barIndex,
      });
    }
  }

  return out;
}

function buildCashFlowDenseChartData(
  range: "Daily" | "Weekly" | "Monthly",
  incomeData: readonly number[],
  expenseData: readonly number[],
): {
  points: CashFlowAreaPoint[];
  anchorCount: number;
  weekTickLabels: string[];
} {
  const anchors = buildCashFlowWeeklyAnchors(range, incomeData, expenseData);
  const points = anchors.map((a, iw) => ({
    weekX: iw,
    income: a.income,
    expense: a.expense,
    tooltipIncome: a.income,
    tooltipExpense: a.expense,
    labelLong: a.labelLong,
    barIndex: a.barIndex,
  }));
  return {
    points,
    anchorCount: anchors.length,
    weekTickLabels: anchors.map((a) => a.labelShort),
  };
}

function haloActiveDot(fill: string) {
  return ({ cx, cy }: { cx?: number; cy?: number }) => {
    if (cx == null || cy == null) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={10} fill={fill} fillOpacity={0.28} />
        <circle cx={cx} cy={cy} r={5} fill={fill} stroke="#ffffff" strokeWidth={2} />
      </g>
    );
  };
}

function CashFlowAreaTooltipContent({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashFlowAreaPoint | undefined;
  if (!row) return null;

  const rowFmt = (
    dotColor: string,
    label: string,
    amount: number,
  ) => (
    <div className="flex items-center gap-2 text-[12px] leading-tight">
      <span
        className={SERIES_SWATCH_CLASS}
        style={{ backgroundColor: dotColor }}
      />
      <span className="text-white/[0.52]">{label}</span>
      <span className="text-white/[0.45]">:</span>
      <span className="ml-auto tabular-nums font-medium text-white">{formatUsd(amount)}</span>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-md border p-4 shadow-lg",
        "border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)]",
        "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass-strong)] glass-card-inner",
        TOOLTIP_BACKDROP_BLUR_CLASS,
        "min-w-[11rem]",
      )}
    >
      <div className="mb-3 text-[13px] font-medium leading-snug text-white">
        {row.labelLong}
      </div>
      <div className="flex flex-col gap-2.5">
        {rowFmt(INCOME_BLUE, "Income", row.tooltipIncome)}
        {rowFmt(EXPENSE_SOFT_GRAY_BLUE, "Expense", row.tooltipExpense)}
      </div>
    </div>
  );
}

const CASHFLOW_CHART_BUSY_BAR_HEIGHTS = [38, 52, 44, 61, 48, 55, 42, 58, 50] as const;

export function HeroCashFlowPanel() {
  const sampleActive = useDesignSampleDataActive();
  const dashboardRefresh = useDashboardRefreshOptional();
 // Phase 3 surgical wire (2026-05-25): real /api/transactions data bucketed
 // into the same Daily/Weekly/Monthly shape Chris's mock used. When sample
 // is cleared, charts show the user's actual cash flow (or zeros if they
 // have no transactions yet) instead of hardcoded mock arrays.
  const cashFlowData = useCashFlowData();
  const chartBusy =
    (dashboardRefresh?.isRefreshing ?? false) ||
    (!sampleActive && (cashFlowData.isLoading || cashFlowData.isRefreshing));
  const [chartMode, setChartMode] = useState<ChartMode>("area");
  const [tab, setTab] = useState<CashTab>("income");
  const [timeRange, setTimeRange] = useState<"Daily" | "Weekly" | "Monthly">("Weekly");
  const [selectedIdx, setSelectedIdx] = useState(DEFAULT_SELECTED_BAR_IDX);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
 /** Bumps only when switching area → bar so bars remount and height-stagger in like income/expense. */
  const [barRevealSeq, setBarRevealSeq] = useState(0);
 /** True briefly after area → bar: bars use a slower height tween than Income/Expenses tab morphs. */
  const [barRevealSlowFromArea, setBarRevealSlowFromArea] = useState(false);
  const reduceMotion = useReducedMotion();
  const gradId = useId().replace(/:/g, "");

 // Effective income/expense arrays for the current timeRange.
 // - sampleActive → Chris's prebaked CHART_DATA_INCOME/EXPENSE (demo mode)
 // - !sampleActive → real bucketed data from useCashFlowData() (real user view)
  const effectiveIncomeForRange: readonly number[] = useMemo(() => {
    if (sampleActive) return CHART_DATA_INCOME[timeRange] ?? CHART_DATA_INCOME.Weekly;
    return cashFlowData.income[timeRange] ?? cashFlowData.income.Weekly;
  }, [sampleActive, timeRange, cashFlowData]);

  const effectiveExpenseForRange: readonly number[] = useMemo(() => {
    if (sampleActive) return CHART_DATA_EXPENSE[timeRange] ?? CHART_DATA_EXPENSE.Weekly;
    return cashFlowData.expense[timeRange] ?? cashFlowData.expense.Weekly;
  }, [sampleActive, timeRange, cashFlowData]);

 // Phase 3 surgical (2026-05-25): dynamic Y-axis scaling so real data
 // ($200-$300) doesn't overflow the hardcoded $2K mock scale. Computed
 // from union of BOTH tabs' data so toggling income/expense doesn't shift
 // the axis. Falls back to mock-scale ($0-$6K) when sample is active.
  const dynamicYAxis = useMemo(() => {
    if (sampleActive) return { max: CHART_MAX, labels: buildYAxisLabels(CHART_MAX) };
    return computeYAxisFromData([...effectiveIncomeForRange, ...effectiveExpenseForRange]);
  }, [sampleActive, effectiveIncomeForRange, effectiveExpenseForRange]);

  const {
    points: areaData,
    anchorCount: areaAnchorCount,
    weekTickLabels: areaWeekTickLabels,
  } = useMemo(() => {
    return buildCashFlowDenseChartData(timeRange, effectiveIncomeForRange, effectiveExpenseForRange);
  }, [timeRange, effectiveIncomeForRange, effectiveExpenseForRange]);

  const barValues = useMemo(() => {
    return tab === "income" ? effectiveIncomeForRange : effectiveExpenseForRange;
  }, [tab, effectiveIncomeForRange, effectiveExpenseForRange]);

  const headlineTotal = barValues[selectedIdx] ?? 0;

  const incomeGradId = `heroCashIncome-${gradId}`;
  const expenseGradId = `heroCashExpense-${gradId}`;

  const barHeightTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { type: "tween" as const, duration: 2.5, ease: [0.16, 1, 0.3, 1] as const };

  const barHeightTransitionFromAreaChart = reduceMotion
    ? barHeightTransition
    : { type: "tween" as const, duration: 4.0, ease: [0.16, 1, 0.3, 1] as const };

  const barMotionTransition = barRevealSlowFromArea
    ? barHeightTransitionFromAreaChart
    : barHeightTransition;

  useEffect(() => {
    if (!barRevealSlowFromArea) return;
    const maxColIndex = BAR_VALUES_INCOME.length - 1;
    const stagger = reduceMotion ? 0 : maxColIndex * 0.06;
    const duration = reduceMotion ? 0.12 : 4.0;
    const t = window.setTimeout(
      () => setBarRevealSlowFromArea(false),
      Math.ceil((duration + stagger) * 1000) + 120,
    );
    return () => window.clearTimeout(t);
  }, [barRevealSlowFromArea, reduceMotion]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden isolation-isolate",
        "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]",
      )}
    >
      <div className="pointer-events-none absolute left-32 top-32 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-[#0D90FF] opacity-[0.10] blur-[60px] z-0" />
      <div className="flex shrink-0 flex-col gap-4 px-4 pb-3 pt-4 sm:gap-5 sm:px-6 sm:pb-4 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-normal leading-snug text-[var(--color-text-muted)] sm:text-[12px]">
              Cash Flow
              <SampleDataLabel />
            </div>
            <div className="mt-3 block min-h-[26px] sm:mt-3.5 sm:min-h-[28px]">
              {chartBusy ? (
                <span role="status" aria-label="Loading cash flow">
                  <WalletSkeletonText className="block text-[26px] font-semibold tabular-nums leading-none tracking-tight sm:text-[28px]">
                    {headlineTotal === 0 ? formatUsdCompact(headlineTotal) : formatUsd(headlineTotal)}
                  </WalletSkeletonText>
                </span>
              ) : (
                <div className="text-[26px] font-semibold tabular-nums leading-none tracking-tight text-white sm:text-[28px]">
                  {headlineTotal === 0 ? formatUsdCompact(headlineTotal) : formatUsd(headlineTotal)}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-stretch gap-1">
            <button
              type="button"
              onClick={() => {
                if (chartMode === "area") {
                  setBarRevealSeq((s) => s + 1);
                  setBarRevealSlowFromArea(true);
                }
                setChartMode("bar");
              }}
              aria-pressed={chartMode === "bar"}
              className={cn(
                "inline-flex min-h-0 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-0 px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:text-[12px]",
                chartMode === "bar"
                  ? "bg-white/[0.04]"
                  : "bg-transparent hover:bg-white/[0.03]",
              )}
              aria-label="Bar chart"
            >
              <IconChartBar
                className={cn(
                  "size-3.5",
                  chartMode === "bar" ? "text-white" : "text-[var(--color-text-primary)] opacity-70",
                )}
                stroke={1.75}
              />
            </button>
            <button
              type="button"
              onClick={() => setChartMode("area")}
              aria-pressed={chartMode === "area"}
              className={cn(
                "inline-flex min-h-0 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-0 px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:text-[12px]",
                chartMode === "area"
                  ? "bg-white/[0.04]"
                  : "bg-transparent hover:bg-white/[0.03]",
              )}
              aria-label="Area chart"
            >
              <IconGraph
                className={cn(
                  "size-3.5",
                  chartMode === "area" ? "text-white" : "text-[var(--color-text-primary)] opacity-70",
                )}
                stroke={1.75}
              />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    OVERVIEW_HEADER_PILL_BUTTON_CLASSNAME,
                    "!grid w-[82px] !grid-cols-[1fr_14px] !px-2"
                  )}
                >
                  <span className="truncate text-center">{timeRange}</span>
                  <IconChevronDown className="size-3.5 opacity-70" stroke={2} aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className={cn(WALLET_GLASS_MENU_CONTENT, "!min-w-0 !grid !gap-1 !p-1")}
              >
                {(["Daily", "Weekly", "Monthly"] as const).map((r) => {
                  const selected = timeRange === r;
                  return (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => setTimeRange(r)}
                      className={cn(
                        "!grid cursor-pointer grid-cols-[14px_auto] items-center gap-1 rounded-[var(--radius-sm)] !m-0 !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs",
                        selected
                          ? "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
                          : "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
                      )}
                    >
                      <span className="flex h-3.5 w-3.5 items-center justify-center">
                        {selected ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
                      </span>
                      <span className="whitespace-nowrap text-left">{r}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-2 pb-2 sm:gap-3 sm:pb-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setTab("income")}
              className={cn(
                "rounded-[var(--radius-sm)] border-0 px-2 py-1 text-[10px] font-medium transition-colors sm:px-2.5 sm:py-1.5 sm:text-[11px]",
                tab === "income"
                  ? "bg-white/[0.05] text-white"
                  : "bg-transparent text-white/50 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              Income
            </button>
            <button
              type="button"
              onClick={() => setTab("expense")}
              className={cn(
                "rounded-[var(--radius-sm)] border-0 px-2 py-1 text-[10px] font-medium transition-colors sm:px-2.5 sm:py-1.5 sm:text-[11px]",
                tab === "expense"
                  ? "bg-white/[0.05] text-white"
                  : "bg-transparent text-white/50 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              Expenses
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-visible px-4 pb-4 pt-0 sm:px-6 sm:pb-5 sm:pt-1">
        <div className="grid min-h-[204px] flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-2 sm:min-h-[228px] sm:gap-x-3">
          <div className="flex min-h-0 h-full min-w-0 flex-col pt-1">
            <div className="flex min-h-0 flex-1 flex-col justify-between text-right pb-1">
              {dynamicYAxis.labels.map((lab) => (
                <span
                  key={lab}
                  className="text-[9px] font-medium tabular-nums leading-none text-white/35 sm:text-[10px]"
                >
                  {lab}
                </span>
              ))}
            </div>
            <div className={cn("shrink-0", chartMode === "bar" ? "h-5 sm:h-6" : "h-6")} aria-hidden />
          </div>

          <div className="flex h-full min-h-[192px] min-w-0 flex-col sm:min-h-[212px]">
            <div className="relative flex min-h-0 flex-1 flex-col">
              {chartMode === "bar" ? (
                <>
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pt-1 pb-1">
                    {dynamicYAxis.labels.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-px w-full",
                          i === dynamicYAxis.labels.length - 1 ? "bg-transparent" : "bg-white/[0.07]",
                        )}
                      />
                    ))}
                  </div>

                  <div
                    key={`cashflow-bar-bars-${barRevealSeq}`}
                    className="relative z-[1] flex min-h-0 flex-1 items-stretch gap-px pt-0 sm:gap-px"
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {barValues.map((val, i) => {
                      const isRemovedBarSlot = i === 0 || i === barValues.length - 1;
                      if (isRemovedBarSlot) {
                        return (
                          <div
                            key={i}
                            className="relative flex min-h-0 min-w-0 flex-1 flex-col justify-end"
                            aria-hidden
                          />
                        );
                      }

                      const selected = i === selectedIdx;
                      const lit =
                        hoveredIdx !== null ? i === hoveredIdx : i === selectedIdx;
                      const focusIdx =
                        hoveredIdx !== null ? hoveredIdx : selectedIdx;
                      const neighborDistance = lit
                        ? 0
                        : Math.abs(i - focusIdx);
                      const hPct =
                        val === 0 ? 0 : Math.min(100, Math.max(5, (val / dynamicYAxis.max) * 100));
                      const barSeriesColor =
                        tab === "income" ? INCOME_BLUE : EXPENSE_SOFT_GRAY_BLUE;
                      const barSeriesLabel =
                        tab === "income" ? "Income" : "Expense";
 /** Bars 1–2 sit next to panel edge; trailing-edge anchor pushes tooltip past `overflow-x-clip`. Flip to leading edge at bar center. */
                      const barTooltipLeadingEdgeAnchored =
                        i <= 2;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "relative flex min-h-0 min-w-0 flex-1 flex-col justify-end",
 /* Late flex siblings paint later and cover earlier tooltips unless the active column is raised. */
                            lit && "z-[100]",
                          )}
                          onMouseEnter={() => setHoveredIdx(i)}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedIdx(i)}
                            className="relative z-[1] flex h-full w-full flex-col items-center justify-end overflow-visible border-0 bg-transparent p-0"
                            aria-pressed={selected}
                            aria-label={`Period ${i + 1}, ${formatUsd(val)}`}
                          >
                            <motion.span
                              layout={false}
                              className="relative mx-auto block min-h-[3px] w-[84%] overflow-visible rounded-t-[var(--radius-sm)] sm:w-[87%]"
                              initial={
                                reduceMotion ? false : { height: "5%" }
                              }
                              animate={{ height: `${hPct}%` }}
                              transition={{
                                ...barMotionTransition,
                                delay: reduceMotion ? 0 : i * 0.06,
                              }}
                            >
                              <span
                                className="absolute inset-0 z-[1] rounded-t-[var(--radius-sm)]"
                                style={inactiveGrayStyleForNeighborDistance(
                                  neighborDistance,
                                )}
                              />
                              {lit ? (
                                <span
                                  className="pointer-events-none absolute inset-x-0 top-0 z-[2] rounded-t-[var(--radius-sm)]"
                                  style={{
                                    height: "75%",
                                    boxShadow: BAR_ACTIVE_SHADOW,
                                  }}
                                  aria-hidden
                                />
                              ) : null}
                              <span
                                className={cn(
                                  "absolute inset-0 z-[3] rounded-t-[var(--radius-sm)]",
                                  lit ? "opacity-100" : "opacity-0",
                                )}
                                style={{
                                  ...BAR_HEEL_MASK_FILL_ONLY,
                                  background: BAR_BG_PRIMARY,
                                }}
                              />
                              <div
                                className={cn(
                                  "absolute bottom-full left-1/2 z-[35] mb-2 w-max min-w-[11rem] max-w-[min(100vw,18rem)]",
                                  barTooltipLeadingEdgeAnchored
                                    ? "translate-x-0"
                                    : "-translate-x-full",
                                  "rounded-md border p-4 shadow-lg",
                                  "border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)]",
                                  "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass-strong)] glass-card-inner",
                                  TOOLTIP_BACKDROP_BLUR_CLASS,
                                  lit ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                                )}
                                aria-hidden={!lit}
                                role="status"
                              >
                                <div className="flex items-center gap-2 text-[12px] leading-tight">
                                  <span
                                    className={SERIES_SWATCH_CLASS}
                                    style={{ backgroundColor: barSeriesColor }}
                                  />
                                  <span className="text-white/[0.52]">
                                    {barSeriesLabel}
                                  </span>
                                  <span className="text-white/[0.45]">:</span>
                                  <span className="ml-auto tabular-nums font-medium text-white">
                                    {formatUsd(val)}
                                  </span>
                                </div>
                              </div>
                            </motion.span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="relative z-[1] flex min-h-[192px] w-full flex-1 flex-col pt-0 sm:min-h-[212px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={areaData}
                      margin={{ top: 4, right: 4, left: -4, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id={incomeGradId} x1="0" y1="0" x2="0" y2="1">
                          {/* Ribbon under stroke → deeper mid-core → bleed to nothing into plot well */}
                          <stop offset="0%" stopColor={INCOME_BLUE} stopOpacity={0.15} />
                          <stop offset="14%" stopColor={INCOME_BLUE} stopOpacity={0.21} />
                          <stop offset="38%" stopColor={INCOME_BLUE} stopOpacity={0.14} />
                          <stop offset="62%" stopColor={INCOME_BLUE} stopOpacity={0.05} />
                          <stop offset="84%" stopColor={INCOME_BLUE} stopOpacity={0.01} />
                          <stop offset="100%" stopColor={INCOME_BLUE} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id={expenseGradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={EXPENSE_SOFT_GRAY_BLUE} stopOpacity={0.16} />
                          <stop offset="16%" stopColor={EXPENSE_SOFT_GRAY_BLUE} stopOpacity={0.2} />
                          <stop offset="40%" stopColor={EXPENSE_SOFT_GRAY_BLUE} stopOpacity={0.13} />
                          <stop offset="64%" stopColor={EXPENSE_SOFT_GRAY_BLUE} stopOpacity={0.05} />
                          <stop offset="86%" stopColor={EXPENSE_SOFT_GRAY_BLUE} stopOpacity={0.01} />
                          <stop offset="100%" stopColor={EXPENSE_SOFT_GRAY_BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="4 4"
                        stroke="rgba(255,255,255,0.04)"
                        vertical={false}
                        horizontal
                      />
                      <XAxis
                        type="number"
                        dataKey="weekX"
                        domain={[0, Math.max(0, areaAnchorCount - 1)]}
                        ticks={Array.from(
                          { length: Math.max(0, areaAnchorCount) },
                          (_, idx) => idx,
                        )}
                        tickFormatter={(v) =>
                          areaWeekTickLabels[Math.round(Number(v))] ?? ""
                        }
                        allowDecimals={false}
                        scale="linear"
                        tickMargin={8}
                        tick={{
                          fill: "rgba(255,255,255,0.32)",
                          fontSize: 9,
                          fontWeight: 500,
                        }}
                        axisLine={false}
                        tickLine={false}
                        height={24}
                      />
                      <YAxis hide domain={[0, dynamicYAxis.max]} tickCount={4} />
                      <Tooltip
                        shared
                        position={{ y: 18 }}
                        cursor={false}
                        wrapperStyle={{
                          padding: 0,
                          borderRadius: 6,
                          background: "transparent",
                          outline: "none",
                          border: "none",
                          boxShadow: "none",
                        }}
                        content={(props) => <CashFlowAreaTooltipContent {...props} />}
                      />
                      {/* Income wash underneath; expense series on top - unchanged stacking. */}
                      <Area
                        type="monotone"
                        dataKey="income"
                        stroke={INCOME_BLUE}
                        strokeWidth={AREA_STROKE_WIDTH}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill={`url(#${incomeGradId})`}
                        fillOpacity={1}
                        dot={false}
                        activeDot={haloActiveDot(INCOME_BLUE)}
                        isAnimationActive={!reduceMotion}
                      />
                      <Area
                        type="monotone"
                        dataKey="expense"
                        stroke={EXPENSE_SOFT_GRAY_BLUE}
                        strokeWidth={AREA_STROKE_WIDTH}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill={`url(#${expenseGradId})`}
                        fillOpacity={1}
                        dot={false}
                        activeDot={haloActiveDot(EXPENSE_SOFT_GRAY_BLUE)}
                        isAnimationActive={!reduceMotion}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="shrink-0 h-5 sm:h-6" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
