"use client";

import { motion } from "framer-motion";
import CardSection from "../../../components/CardSection";
import TransactionsPanel from "../../../components/TransactionsPanel";
import StatisticsChart from "../../../components/StatisticsChart";
import SmartInvestPanel from "../../../components/SmartInvestPanel";
import BarChartWidget from "../../../components/BarChartWidget";
import { GRID_ANIMATION } from "../config/animations";

const WIDGETS = [
  {
    id: "cards",
    Component: CardSection,
    className: "col-span-1 md:col-span-2 xl:col-span-2 h-auto",
    delay: 0,
  },
  {
    id: "smart-invest",
    Component: SmartInvestPanel,
    className:
      "col-span-1 md:col-span-2 xl:col-span-1 xl:row-start-1 xl:col-start-3 xl:row-span-2 h-auto min-h-0",
    delay: 0.1,
  },
  {
    id: "transactions",
    Component: TransactionsPanel,
    className:
      "col-span-1 xl:row-start-2 xl:col-start-1 h-[280px] sm:h-auto md:h-[350px] xl:h-[500px]",
    delay: 0.2,
  },
  {
    id: "statistics",
    Component: StatisticsChart,
    className:
      "col-span-1 xl:row-start-2 xl:col-start-2 h-[280px] sm:h-auto md:h-[350px] xl:h-[500px]",
    delay: 0.3,
  },
  {
    id: "bar-chart",
    Component: BarChartWidget,
    className:
      "col-span-1 xl:row-start-3 xl:col-start-3 h-[350px] sm:h-[400px] md:h-[450px] xl:h-[500px]",
    delay: 0.5,
  },
] as const;

export default function WidgetGrid() {
  return (
    <div className="grid gap-4 w-full grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {WIDGETS.map(({ id, Component, className, delay }) => (
        <motion.div
          key={id}
          className={className}
          initial={GRID_ANIMATION.initial}
          animate={GRID_ANIMATION.animate}
          transition={{ ...GRID_ANIMATION.transition, delay }}
        >
          <Component />
        </motion.div>
      ))}
    </div>
  );
}
