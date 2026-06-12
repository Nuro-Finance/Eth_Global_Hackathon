import React from "react";
import { cn } from "@/lib/utils";
import {
  SETTINGS_SECTION_ICON_CLASS,
  SETTINGS_SECTION_ICON_SPACER_CLASS,
} from "@/features/dashboard/settings/settingsStyles";

interface SettingsSectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Matches icon column + gap offset used by SettingsSection child rows. */
export const SETTINGS_SECTION_FULL_BLEED_HEADER_CLASS =
  "-ml-14 w-[calc(100%+3.5rem)]";

export function SettingsSectionHeader({
  title,
  description,
  icon,
  actions,
  className,
}: SettingsSectionHeaderProps) {
  return (
    <div className={cn("flex w-full gap-3", className)}>
      {icon ? (
        <div className={SETTINGS_SECTION_ICON_CLASS}>{icon}</div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-center sm:text-left">
          <h2 className="text-[16px] font-medium text-[var(--color-text-primary)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Stretch body to fill parent (Cards empty state in settings panel). */
  fillBody?: boolean;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  icon,
  actions,
  children,
  className,
  fillBody = false,
}) => {
  const hasIcon = Boolean(icon);

  return (
    <div className={cn("space-y-4", fillBody && "flex h-full min-h-0 flex-col", className)}>
      <SettingsSectionHeader
        title={title}
        description={description}
        icon={icon}
        actions={actions}
      />
      <div className={cn("mt-2 flex gap-3", fillBody && "min-h-0 flex-1")}>
        {hasIcon ? (
          <div className={SETTINGS_SECTION_ICON_SPACER_CLASS} aria-hidden="true" />
        ) : null}
        <div
          className={cn(
            "min-w-0 flex-1",
            fillBody && "flex min-h-0 flex-1 flex-col",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsSection;
