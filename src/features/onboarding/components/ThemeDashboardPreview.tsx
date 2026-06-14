export const THEME_PREVIEW_WIDTH = 245;
export const THEME_PREVIEW_HEIGHT = 156;

type ThemeDashboardVariant = "light" | "dark";

const CARD_RADIUS = 22;

const PALETTE = {
  light: {
    canvas: "#EBEBEF",
    topBar: "#FFFFFF",
    sidebar: "#F3F3F6",
    content: "#EBEBEF",
    card: "#FFFFFF",
    navInactive: "#C4C4CC",
    navActive: "#6B7280",
    linePrimary: "#D1D5DB",
    lineSecondary: "#E5E7EB",
    donutCenter: "#FFFFFF",
  },
  dark: {
    canvas: "#121212",
    topBar: "#181818",
    sidebar: "#181818",
    content: "#121212",
    card: "#1E1E1E",
    navInactive: "#404040",
    navActive: "#9CA3AF",
    linePrimary: "#4B5563",
    lineSecondary: "#374151",
    donutCenter: "#1E1E1E",
  },
} as const;

const CHART = {
  green: "#10B981",
  purple: "#8B5CF6",
  yellow: "#FBBF24",
  blue: "#3B82F6",
} as const;

/** Balanced 2×2 / 1×4 grid - equal row heights, generous inner padding */
const LAYOUT = {
  pad: 28,
  sidebarW: 56,
  topBarH: 52,
  contentX: 84,
  contentY: 80,
  contentW: 912,
  rowGap: 24,
  rowH: 260,
  colGap: 24,
  topRowW: 444,
  bottomCardW: 210,
} as const;

const ROW2_Y = LAYOUT.contentY + LAYOUT.rowH + LAYOUT.rowGap;
const TOP_RIGHT_X = LAYOUT.contentX + LAYOUT.topRowW + LAYOUT.colGap;

const BAR_HEIGHTS = [72, 102, 122, 142, 154, 164, 154, 142, 122, 102, 72];
const BAR_WIDTH = 22;
const BAR_GAP = 10;
const BAR_BASE_Y = LAYOUT.contentY + LAYOUT.rowH - LAYOUT.pad;

function DonutChart({ centerFill, cx, cy }: { centerFill: string; cx: number; cy: number }) {
  const outer = 62;
  const inner = 31;

  return (
    <>
      <circle cx={cx} cy={cy} r={outer} fill={CHART.green} />
      <path
        d={`M${cx} ${cy - outer} A${outer} ${outer} 0 0 1 ${cx + outer} ${cy} L${cx + inner} ${cy} A${inner} ${inner} 0 0 0 ${cx} ${cy - inner} Z`}
        fill={CHART.purple}
      />
      <path
        d={`M${cx + outer} ${cy} A${outer} ${outer} 0 0 1 ${cx} ${cy + outer} L${cx} ${cy + inner} A${inner} ${inner} 0 0 0 ${cx + inner} ${cy} Z`}
        fill={CHART.blue}
      />
      <path
        d={`M${cx} ${cy + outer} A${outer} ${outer} 0 0 1 ${cx - outer} ${cy} L${cx - inner} ${cy} A${inner} ${inner} 0 0 0 ${cx} ${cy + inner} Z`}
        fill={CHART.yellow}
      />
      <circle cx={cx} cy={cy} r={inner} fill={centerFill} />
    </>
  );
}

function LegendRows({
  linePrimary,
  lineSecondary,
  originY,
}: {
  linePrimary: string;
  lineSecondary: string;
  originY: number;
}) {
  const rows = [
    { color: CHART.green, w1: 108, w2: 72 },
    { color: CHART.purple, w1: 98, w2: 64 },
    { color: CHART.blue, w1: 92, w2: 80 },
    { color: CHART.yellow, w1: 104, w2: 68 },
  ];

  return (
    <>
      {rows.map(({ color, w1, w2 }, index) => {
        const y = originY + index * 32;
        return (
          <g key={color}>
            <circle cx="292" cy={y} r="5" fill={color} />
            <rect x="304" y={y - 4} width={w1} height="8" rx="4" fill={linePrimary} />
            <rect x="304" y={y + 8} width={w2} height="6" rx="3" fill={lineSecondary} />
          </g>
        );
      })}
    </>
  );
}

function BarChart() {
  const totalBarsW = BAR_HEIGHTS.length * BAR_WIDTH + (BAR_HEIGHTS.length - 1) * BAR_GAP;
  const startX = TOP_RIGHT_X + (LAYOUT.topRowW - totalBarsW) / 2;

  return (
    <>
      {BAR_HEIGHTS.map((height, index) => {
        const x = startX + index * (BAR_WIDTH + BAR_GAP);
        return (
          <rect
            key={x}
            x={x}
            y={BAR_BASE_Y - height}
            width={BAR_WIDTH}
            height={height}
            rx="8"
            fill={CHART.blue}
          />
        );
      })}
    </>
  );
}

function StatCards({
  linePrimary,
  lineSecondary,
}: {
  linePrimary: string;
  lineSecondary: string;
}) {
  const cards = [
    { x: LAYOUT.contentX, accent: CHART.green },
    { x: LAYOUT.contentX + LAYOUT.bottomCardW + LAYOUT.colGap, accent: CHART.blue },
    {
      x: LAYOUT.contentX + (LAYOUT.bottomCardW + LAYOUT.colGap) * 2,
      accent: CHART.yellow,
    },
    {
      x: LAYOUT.contentX + (LAYOUT.bottomCardW + LAYOUT.colGap) * 3,
      accent: CHART.purple,
    },
  ];

  const innerTop = ROW2_Y + LAYOUT.pad;

  return (
    <>
      {cards.map(({ x, accent }) => (
        <g key={x}>
          <rect x={x + LAYOUT.pad} y={innerTop} width="22" height="22" rx="6" fill={accent} />
          <rect x={x + LAYOUT.pad + 30} y={innerTop + 2} width="72" height="8" rx="4" fill={linePrimary} />
          <rect x={x + LAYOUT.pad} y={innerTop + 36} width="150" height="8" rx="4" fill={lineSecondary} />
          <rect x={x + LAYOUT.pad} y={innerTop + 56} width="132" height="8" rx="4" fill={lineSecondary} />
          <rect x={x + LAYOUT.pad} y={innerTop + 76} width="112" height="8" rx="4" fill={lineSecondary} />
          <rect x={x + LAYOUT.pad} y={innerTop + 96} width="94" height="8" rx="4" fill={lineSecondary} />
        </g>
      ))}
    </>
  );
}

function ThemeDashboardPreview({ variant }: { variant: ThemeDashboardVariant }) {
  const p = PALETTE[variant];
  const navYs = [88, 128, 168, 208];
  const activeNavIndex = variant === "dark" ? 1 : -1;
  const donutCx = LAYOUT.contentX + 128;
  const donutCy = LAYOUT.contentY + LAYOUT.rowH / 2;

  return (
    <svg
      width={THEME_PREVIEW_WIDTH}
      height={THEME_PREVIEW_HEIGHT}
      viewBox="0 0 1024 652"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="1024" height="652" fill={p.canvas} />
      <rect width="1024" height={LAYOUT.topBarH} fill={p.topBar} />
      <rect x="0" y={LAYOUT.topBarH} width={LAYOUT.sidebarW} height={600} fill={p.sidebar} />
      <rect
        x={LAYOUT.sidebarW}
        y={LAYOUT.topBarH}
        width={968}
        height={600}
        fill={p.content}
      />

      {navYs.map((y, index) => (
        <circle
          key={y}
          cx="28"
          cy={y}
          r="6"
          fill={index === activeNavIndex ? p.navActive : p.navInactive}
        />
      ))}

      <rect
        x={LAYOUT.contentX}
        y={LAYOUT.contentY}
        width={LAYOUT.topRowW}
        height={LAYOUT.rowH}
        rx={CARD_RADIUS}
        fill={p.card}
      />
      <rect
        x={TOP_RIGHT_X}
        y={LAYOUT.contentY}
        width={LAYOUT.topRowW}
        height={LAYOUT.rowH}
        rx={CARD_RADIUS}
        fill={p.card}
      />

      {[0, 1, 2, 3].map((index) => (
        <rect
          key={index}
          x={LAYOUT.contentX + index * (LAYOUT.bottomCardW + LAYOUT.colGap)}
          y={ROW2_Y}
          width={LAYOUT.bottomCardW}
          height={LAYOUT.rowH}
          rx={CARD_RADIUS}
          fill={p.card}
        />
      ))}

      <DonutChart centerFill={p.donutCenter} cx={donutCx} cy={donutCy} />
      <LegendRows
        linePrimary={p.linePrimary}
        lineSecondary={p.lineSecondary}
        originY={donutCy - 48}
      />
      <BarChart />
      <StatCards linePrimary={p.linePrimary} lineSecondary={p.lineSecondary} />
    </svg>
  );
}

export function LightThemeDashboardPreview() {
  return <ThemeDashboardPreview variant="light" />;
}

export function DarkThemeDashboardPreview() {
  return <ThemeDashboardPreview variant="dark" />;
}
