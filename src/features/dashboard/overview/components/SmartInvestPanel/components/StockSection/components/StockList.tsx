"use client";

import { AnimatePresence, motion } from "framer-motion";
import { StockItem } from "./StockItem";
import {
  stocksByCategory,
  type StockData,
} from "../../../config/smartInvest.config";

interface StockListProps {
  activeTab?: string;
  stocks?: StockData[];
}

/**
 * List of stock items with smooth tab content transition
 */
export function StockList({ activeTab = "Popular", stocks }: StockListProps) {
  // Get stocks for the active category, or use provided stocks
  const displayStocks =
    stocks || stocksByCategory[activeTab] || stocksByCategory.Popular;

  return (
    <div className="mt-3 mb-4 sm:mb-6 relative min-h-[180px] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 30, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -30, filter: "blur(8px)" }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {displayStocks.map((stock, index) => (
            <StockItem key={`${activeTab}-${index}`} {...stock} />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
