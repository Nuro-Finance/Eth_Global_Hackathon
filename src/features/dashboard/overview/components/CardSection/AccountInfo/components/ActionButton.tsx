"use client";

import { motion } from "framer-motion";
import { IconButton } from "@/components/ui";

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  delay?: number;
}

/**
 * Action button with icon and label
 */
export function ActionButton({
  icon,
  label,
  onClick,
  delay = 0,
}: ActionButtonProps) {
  return (
    <motion.div
      className="flex flex-col items-center cursor-pointer min-w-[60px] gap-1.5"
      onClick={onClick}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 200, duration: 0.5 }}
    >
      <IconButton
        variant="default"
        size="sm"
        rounded="full"
        className="w-[38px] h-[38px] md:w-[44px] md:h-[44px]"
        icon={
          <div className="w-4 h-4 md:w-5 md:h-5 text-[var(--color-text-primary)]">
            {icon}
          </div>
        }
      />
      <span className="text-[var(--color-text-primary)] text-[10px] md:text-[12px] font-normal text-center leading-tight">
        {label}
      </span>
    </motion.div>
  );
}
