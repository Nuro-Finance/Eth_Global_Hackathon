"use client";

import { IconSearch } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui";
import { Switch } from "@/components/ui/switch";

interface HeaderActionsProps {
  className?: string;
  /** Dev only: ON = populated demo data app-wide */
  devPopulatedPreview?: boolean;
  onToggleDevPopulatedPreview?: () => void;
}

/**
 * Header action buttons - Search and Refresh
 */
export function HeaderActions({
  className = "",
  devPopulatedPreview,
  onToggleDevPopulatedPreview,
}: HeaderActionsProps) {
  const t = useTranslations("Header");

  const handleSearch = () => {
    // TODO: Implement search functionality
    console.log("Search clicked");
  };

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {onToggleDevPopulatedPreview ? (
        <div className="mr-1 flex items-center gap-1.5">
          <Switch
            size="sm"
            checked={Boolean(devPopulatedPreview)}
            onChange={onToggleDevPopulatedPreview}
            thumbClassName={
              devPopulatedPreview ? "bg-blue-400" : "bg-white/30"
            }
            className={
              devPopulatedPreview
                ? "bg-blue-500/20 border border-blue-500/30"
                : "bg-white/[0.04] border border-white/10"
            }
            aria-label="Dev preview: Demo data (off = new user empty)"
          />
        </div>
      ) : null}
      <IconButton
        variant="canvas"
        onClick={handleSearch}
        aria-label={t("search")}
        icon={
          <IconSearch
            className="w-5 h-5 text-[var(--color-text-primary)]"
            stroke={1.5}
          />
        }
      />
    </div>
  );
}

export default HeaderActions;
