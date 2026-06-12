"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
 /** Left section - typically contains title/greeting */
  leftSection: ReactNode;
 /** Fills space between left and right; content is aligned to the end (middle-right on wide layouts). */
  middleSection?: ReactNode;
 /** Right section - typically contains actions/buttons */
  rightSection?: ReactNode;
 /** Optional breadcrumb row above the title */
  breadcrumb?: ReactNode;
 /** Additional className for the container */
  className?: string;
}

/**
 * PageHeader - Reusable page header component
 * Provides a flexible layout with left and right sections
 */
export function PageHeader({
  leftSection,
  middleSection,
  rightSection,
  className = "",
}: PageHeaderProps) {
  return (
    <div className={cn(className || "mb-8")}>

      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center",
          middleSection ? "sm:gap-4 lg:gap-6" : "sm:justify-between"
        )}
      >
        <div className="min-w-0 shrink-0">{leftSection}</div>
        {middleSection ? (
          <div className="flex min-w-0 flex-1 items-center justify-end">{middleSection}</div>
        ) : null}
        {rightSection ? (
          <div
            className={cn(
              "flex items-center gap-2 sm:gap-3",
              middleSection ? "w-full shrink-0 sm:w-auto" : "w-full sm:w-auto"
            )}
          >
            {rightSection}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default PageHeader;
