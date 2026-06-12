"use client";

import { memo } from "react";
import { SidebarItemProps } from "../types";
import Tooltip from "@/components/tooltip-bridge";
import { Link } from "@/i18n/navigation";

const SidebarItem = memo<SidebarItemProps>(function SidebarItem({
  icon,
  label,
  href,
  isActive = false,
  badge,
  tooltip,
  collapsed = false,
  tooltipPosition = "right",
}) {
  const renderBadge = () => {
    if (!badge || badge <= 0) return null;

    return (
      <div className="absolute -top-1 -end-1 bg-[var(--color-error)] text-[var(--color-text-primary)] text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
        {badge > 99 ? "99+" : badge}
      </div>
    );
  };

  // Expanded: left-aligned row; collapsed: icon centered in square
  const linkClasses = `
    relative flex transition-all duration-200 ease-in-out group
    rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25
    ${collapsed ? "w-10 h-10 mx-auto justify-center items-center" : "flex-row gap-3 px-3 py-2 w-full justify-start items-center"}
    ${isActive
      ? "bg-[var(--color-primary)]/75"
      : "bg-transparent hover:bg-white/2"
    }
  `.trim();
  const labelClasses = `
    text-[13px] font-medium whitespace-nowrap
    transition-colors duration-200
    ${isActive ? "text-white!" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)]"}
  `.trim();

  const content = (
    <Link
      href={href}
      className={linkClasses}
      aria-label={tooltip || label}
      aria-current={isActive ? "page" : undefined}
    >
      <div className="relative flex items-center justify-center shrink-0 w-5 h-5 [&_svg]:w-5 [&_svg]:h-5 [&_svg]:[stroke-width:1.5px]">
        <span className={isActive ? "text-white!" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)]"}>
          {icon}
        </span>
        {renderBadge()}
      </div>
      {/* Page Name - Persistent DOM with Whitelist Transition */}
      <span className={`
        ${labelClasses}
        overflow-hidden transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${collapsed ? "opacity-0 max-w-0 pointer-events-none ml-0" : "opacity-100 max-w-[124px] ml-3"}
      `}>
        {label}
      </span>
    </Link>
  );

  return (
    <Tooltip 
      content={collapsed && tooltip ? tooltip : ""} 
      position={tooltipPosition}
      disabled={!collapsed || !tooltip}
    >
      {content}
    </Tooltip>
  );
});

export default SidebarItem;
