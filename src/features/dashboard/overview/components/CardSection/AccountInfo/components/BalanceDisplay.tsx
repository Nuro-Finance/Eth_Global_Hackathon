"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import Counter from "@/components/counter";
import { cn } from "@/lib/utils";
import type { CardSectionLayout } from "../../types";

interface BalanceDisplayProps {
  balance: number;
  layout?: CardSectionLayout;
}

function getPlaces(value: number): number[] {
  const absVal = Math.abs(value);
  if (absVal < 1) return [1];
  const digits = Math.floor(Math.log10(absVal)) + 1;
  return Array.from({ length: digits }, (_, i) => Math.pow(10, digits - 1 - i));
}

export function BalanceDisplay({ balance, layout = "standard" }: BalanceDisplayProps) {
  const isSquish = layout === "squish";
  const places = useMemo(() => getPlaces(balance), [balance]);

  return (
    <motion.div
      className={cn(
        "text-start",
        isSquish ? "mb-0 min-w-0" : "mb-3 sm:mb-4 md:mb-6",
      )}
      initial={false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, type: "spring", duration: 0.6 }}
    >
      <div
        className={cn(
          "flex items-center font-semibold leading-none text-[var(--color-text-primary)] select-none",
          isSquish ? "hidden" : "md:hidden",
        )}
      >
        <div style={{ height: 32 }} className="flex items-center">
          <span style={{ fontSize: 32, lineHeight: 1 }} className="mr-1">
            $
          </span>
        </div>
        <Counter
          value={balance}
          places={places}
          fontSize={32}
          padding={0}
          gap={0}
          textColor="var(--color-text-primary)"
          fontWeight={600}
          speed={2}
          decimalPlaces={2}
        />
        <div style={{ height: 32 }} className="flex items-end pb-[6px] ml-2">
          <motion.span
            className="text-[12px] text-[var(--color-text-muted)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            USD
          </motion.span>
        </div>
      </div>

      {isSquish ? (
        <div className="flex min-w-0 items-center font-semibold leading-none text-[var(--color-text-primary)] select-none">
          <div style={{ height: 32 }} className="flex shrink-0 items-center">
            <span style={{ fontSize: 32, lineHeight: 1 }} className="mr-1">
              $
            </span>
          </div>
          <Counter
            value={balance}
            places={places}
            fontSize={32}
            padding={0}
            gap={0}
            textColor="var(--color-text-primary)"
            fontWeight={600}
            speed={2}
            decimalPlaces={2}
          />
          <div
            style={{ height: 32 }}
            className="flex shrink-0 items-end pb-[6px] ml-2 min-[768px]:max-[790px]:hidden"
          >
            <motion.span
              className="text-[12px] text-[var(--color-text-muted)]"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
            >
              USD
            </motion.span>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex items-center font-semibold leading-none text-[var(--color-text-primary)] select-none">
          <div style={{ height: 40 }} className="flex items-center">
            <span style={{ fontSize: 40, lineHeight: 1 }} className="mr-1">
              $
            </span>
          </div>
          <Counter
            value={balance}
            places={places}
            fontSize={40}
            padding={0}
            gap={0}
            textColor="var(--color-text-primary)"
            fontWeight={600}
            speed={2}
            decimalPlaces={2}
          />
          <div style={{ height: 40 }} className="flex items-end pb-[6px] ml-2">
            <motion.span
              className="text-[14px] text-[var(--color-text-muted)]"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
            >
              USD
            </motion.span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
