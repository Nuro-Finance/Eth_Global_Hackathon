"use client";

import { useEffect, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { hasLocale, useLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import flags from "react-phone-number-input/flags";
import { cn } from "@/lib/utils";
import Dropdown from "@/components/dropdown";
import { useHeaderMenu } from "@/layouts/Header/HeaderMenuContext";
import { ChevronDown } from "lucide-react";
import { SETTINGS_USER_NAV_ITEM_SELECTED } from "@/features/dashboard/settings/settingsStyles";

interface LanguageSelectorProps {
  variant?: "icon" | "list" | "settings";
  className?: string;
  triggerClassName?: string;
  showChevron?: boolean;
}

// Rectangle flag style (same as PhoneInput / CountrySelect)
const FlagWrapper = ({ country, className }: { country: keyof typeof flags; className?: string }) => {
  const Flag = flags[country];
  if (!Flag) return null;
  return (
    <div className={cn("w-6 h-4 shrink-0 overflow-hidden rounded-[2px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full", className)}>
      <Flag title={country} />
    </div>
  );
};

const languageOptions = [
  { id: "en", label: "English", shortLabel: "US", country: "US" as keyof typeof flags },
  { id: "zh", label: "Mandarin Chinese", shortLabel: "CN", country: "CN" as keyof typeof flags },
  { id: "es", label: "Spanish", shortLabel: "MX", country: "MX" as keyof typeof flags },
  { id: "ru", label: "Russian", shortLabel: "RU", country: "RU" as keyof typeof flags },
  { id: "pt", label: "Portuguese", shortLabel: "BR", country: "BR" as keyof typeof flags },
  { id: "hi", label: "India", shortLabel: "IN", country: "IN" as keyof typeof flags },
  { id: "ar", label: "العربية", shortLabel: "SA", country: "SA" as keyof typeof flags },
];

/**
 * Language selector with country flags
 */
export function LanguageSelector({
  variant = "icon",
  className = "",
  triggerClassName = "",
  showChevron = false,
}: LanguageSelectorProps) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const headerMenu = useHeaderMenu();

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentLang =
    languageOptions.find((opt) => opt.id === locale) || languageOptions[0];

  const handleLocaleChange = (targetLocale: string) => {
    if (!hasLocale(routing.locales, targetLocale)) return;
    const params = searchParams.toString();
    const queryString = params ? `?${params}` : "";
    const path =
      typeof pathname === "string" && pathname.startsWith("/") ? pathname : "/";
    window.location.href = `/${targetLocale}${path}${queryString}`;
  };

  if (variant === "list") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex flex-col gap-1">
          {languageOptions.map((option) => {
            const isActive = option.id === locale;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleLocaleChange(option.id)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors border",
                  isActive
                    ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-text-primary)]"
                    : "border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                )}
              >
                <FlagWrapper country={option.country} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const dropdownItems = languageOptions.map((option) => {
    if (variant === "settings") {
      return {
        id: option.id,
        onClick: () => handleLocaleChange(option.id),
        icon: <FlagWrapper country={option.country} className="w-6 h-4" />,
        label: option.label,
        className:
          option.id === locale ? SETTINGS_USER_NAV_ITEM_SELECTED : undefined,
      };
    }

    return {
      id: option.id,
      onClick: () => handleLocaleChange(option.id),
      className: cn(
        "flex items-center gap-3 px-3 py-1 transition-all duration-300",
        option.id === locale &&
          "bg-[var(--color-bg-input)] text-[var(--color-text-primary)] dark:bg-[var(--color-bg-input)]"
      ),
      content: (
        <div className="flex w-full items-center gap-3">
          <FlagWrapper country={option.country} className="w-6 h-4" />
          <span className="text-[13px] font-medium">{option.label}</span>
        </div>
      ),
    };
  });

  if (!mounted) return null;

  return (
    <div className={cn("relative", className)}>
      <Dropdown
        modal={false}
        placement="bottom-right"
        variant={variant === "settings" ? "userNav" : "default"}
        userNavPanelWidth="trigger"
        sideOffset={variant === "settings" ? 6 : undefined}
        className={variant === "settings" ? undefined : "min-w-[140px]"}
        {...(headerMenu
          ? {
              open: headerMenu.openMenuId === "language",
              onOpenChange: (open: boolean) => {
                if (open) headerMenu.openMenu("language");
                else if (headerMenu.openMenuId === "language")
                  headerMenu.closeMenu();
              },
            }
          : {})}
        trigger={
          variant === "settings" ? (
            <button
              type="button"
              className={cn(
                "flex h-11 w-32 shrink-0 items-center justify-between rounded-[var(--radius-md)] border border-transparent bg-[var(--color-bg-input)] px-3 text-sm text-[var(--color-text-primary)] shadow-none outline-none transition-colors hover:bg-white/[0.05] focus:border-white/20 focus:outline-none focus:ring-0",
                triggerClassName
              )}
              aria-label="Select language"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FlagWrapper country={currentLang.country} />
                <span className="font-medium">{currentLang.shortLabel}</span>
              </span>
              {showChevron ? (
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50 text-[var(--color-text-muted)]" />
              ) : null}
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                "flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-shell)] bg-transparent px-2.5 transition-colors outline-none hover:bg-[var(--color-bg-hover)] dark:border-[var(--color-border-glass-strong)] dark:hover:bg-[var(--color-bg-input-hover)] sm:px-3",
                triggerClassName
              )}
              aria-label="Select language"
            >
              <FlagWrapper country={currentLang.country} />
              <span className="text-xs font-medium text-[var(--color-text-primary)] transition-colors">
                {currentLang.shortLabel}
              </span>
              {showChevron ? (
                <ChevronDown className="h-4 w-4 opacity-50 text-[var(--color-text-secondary)]" />
              ) : null}
            </button>
          )
        }
        items={dropdownItems}
      />
    </div>
  );
}

export default LanguageSelector;
