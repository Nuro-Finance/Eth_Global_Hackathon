"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { IconLogout } from "@tabler/icons-react";
import Tooltip from "@/components/tooltip-bridge";
import { useAppLogout } from "@/hooks/useAppLogout";

interface SidebarLogoutProps {
  collapsed: boolean;
  tooltipPosition?: "left" | "right";
}

const SidebarLogout = memo<SidebarLogoutProps>(function SidebarLogout({
  collapsed,
  tooltipPosition = "right",
}) {
  const t = useTranslations("Sidebar");
  const handleLogout = useAppLogout();

  const content = (
    <button
      type="button"
      onClick={handleLogout}
      className="relative flex flex-row items-center justify-start gap-3 rounded-[var(--radius-md)] px-3 py-2 w-full text-left transition-all duration-200 hover:bg-white/[0.025] dark:hover:bg-white/[0.015] group text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      aria-label={t("logout")}
    >
      <span className="flex shrink-0 w-5 h-5 items-center justify-center [&_svg]:w-5 [&_svg]:h-5">
        <IconLogout className="w-5 h-5" stroke={1.5} />
      </span>
      {!collapsed && (
        <span className="text-[13px] font-medium whitespace-nowrap">
          {t("logout")}
        </span>
      )}
    </button>
  );

  return collapsed ? (
    <Tooltip content={t("logout")} position={tooltipPosition}>
      {content}
    </Tooltip>
  ) : (
    content
  );
});

export default SidebarLogout;
