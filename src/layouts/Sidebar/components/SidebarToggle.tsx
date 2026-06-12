"use client";

import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarToggleProps {
  collapsed: boolean;
  onToggle: () => void;
}

const SidebarToggle = memo<SidebarToggleProps>(function SidebarToggle({
  collapsed,
  onToggle,
}) {
  return (
    <button
      onClick={onToggle}
      className="absolute -end-3 top-7 w-6 h-6 
        bg-[var(--color-sidebar-bg)] border border-[var(--color-border-shell)]/40 
        rounded-full flex items-center justify-center text-[var(--color-text-dimmed)] 
        hover:text-[var(--color-text-primary)]
        transition-[opacity,transform] duration-300 ease-in-out
        hover:scale-110 hover:shadow-md"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      type="button"
    >
      {collapsed ? (
        <ChevronRight className="w-4 h-4 text-[var(--color-text-primary)] rtl:rotate-y-180 transition-transform duration-300 ease-in-out" />
      ) : (
        <ChevronLeft className="w-4 h-4 text-[var(--color-text-primary)] rtl:rotate-y-180 transition-transform duration-300 ease-in-out" />
      )}
    </button>
  );
});

export default SidebarToggle;
