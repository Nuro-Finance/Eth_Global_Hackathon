"use client";

import { useMemo } from "react";
import { SidebarProps } from "./types";
import { useSidebarState } from "./hooks";
import { SidebarNavigation, SidebarProfile } from "./components";

const Sidebar = ({
  className = "",
  isMobileMenuOpen = false,
  onMobileMenuClose,
}: SidebarProps) => {
  const { collapsed, toggleCollapsed, locale, isRTL, pathname } =
    useSidebarState({
      onMobileMenuClose,
    });

  // Force expanded state when mobile menu is open
  const isCollapsed = isMobileMenuOpen ? false : collapsed;

  // Memoized class names
  // Use -translate-x-[260px] to fully account for the 16px (start-4) padding and the dynamic width so it hides completely
  const sidebarTranslateClass = isMobileMenuOpen
    ? "translate-x-0 xl:translate-x-0"
    : `${isRTL ? "translate-x-[260px]" : "-translate-x-[260px]"} xl:translate-x-0`;

  const sidebarClasses = useMemo(
    () =>
      `
    relative start-0 top-0 bottom-0 z-50
    bg-[var(--color-sidebar-bg)]
    backdrop-blur-[var(--sidebar-blur)]
    glass-card-inner
    transition-[width,transform,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
    rounded-[var(--radius-card)] border border-[var(--color-border-shell)]
    ${isCollapsed ? "w-16" : "w-[240px]"}
    xl:block
    ${className}
  `.trim(),
    [isCollapsed, className, sidebarTranslateClass]
  );

  return (
    <div className={sidebarClasses}>
      <div className="relative flex flex-col h-full pt-1 pb-[88px] sidebar-scrollbar overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-gutter-stable pt-0">
          <SidebarNavigation
            collapsed={isCollapsed}
            pathname={pathname}
            locale={locale}
            isRTL={isRTL}
          />
        </div>
        <div className="absolute bottom-4 inset-x-0 px-3 transition-opacity duration-300">
          <SidebarProfile collapsed={isCollapsed} pathname={pathname} tooltipPosition={isRTL ? "left" : "right"} />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

// Re-exports for external use
export { Sidebar };
export * from "./types";
export * from "./config";
export * from "./hooks";
export * from "./components";
