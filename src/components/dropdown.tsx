"use client";

import { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_DANGER,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";

interface DropdownItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  separator?: boolean;
  content?: ReactNode;
  preventClose?: boolean;
  className?: string;
}

interface DropdownProps {
  /** The trigger element (usually a button) */
  trigger: ReactNode;
  /** Array of dropdown menu items */
  items: DropdownItem[];
  /** Dropdown placement */
  placement?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  /** Additional CSS classes */
  className?: string;
  /** Whether to use modal style */
  modal?: boolean;
  /** Controlled open state (optional) */
  open?: boolean;
  /** Called when open state changes (optional, for controlled mode) */
  onOpenChange?: (open: boolean) => void;
  /** Whether to show the caret arrow pointing to the trigger */
  showArrow?: boolean;
  /** Distance from the trigger */
  sideOffset?: number;
  /**
   * `userNav`: uses `WALLET_GLASS_MENU_CONTENT` + same row spacing/padding as my-wallet overflow menus.
   */
  variant?: "default" | "userNav";
  /**
   * When `variant` is `userNav`: `"trigger"` matches the profile row width (full nav strip);
   * `"content"` uses the compact `w-max` panel (e.g. collapsed sidebar).
   */
  userNavPanelWidth?: "trigger" | "content";
}

/**
 * Bridge component that maintains the old Dropdown API while using shadcn/ui underneath
 */
export default function Dropdown({
  trigger,
  items,
  placement = "bottom-right",
  className = "",
  modal = true,
  open,
  onOpenChange,
  showArrow,
  sideOffset,
  variant = "default",
  userNavPanelWidth = "trigger",
}: DropdownProps) {
  const getSide = () => {
    if (placement.includes("top")) return "top";
    return "bottom";
  };

  const getAlign = () => {
    if (placement.includes("left")) return "start";
    return "end";
  };

  const userNavMeta =
    variant === "userNav"
      ? (() => {
          const indexById = new Map<string, number>();
          let j = 0;
          for (const it of items) {
            if (it.separator) continue;
            indexById.set(it.id, j++);
          }
          return { indexById, total: indexById.size } as const;
        })()
      : null;

  return (
    <DropdownMenu
      modal={modal}
      {...(open !== undefined ? { open, onOpenChange } : {})}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={getSide()}
        align={getAlign()}
        className={cn(
          variant === "userNav" && WALLET_GLASS_MENU_CONTENT,
          /* Full strip: match trigger; collapsed sidebar: keep default w-max from WALLET_GLASS_MENU_CONTENT */
          variant === "userNav" &&
            userNavPanelWidth === "trigger" &&
            "w-[var(--radix-dropdown-menu-trigger-width)] min-w-0",
          /* Stretch every row to the same width as the widest item (matches wallet overflow menus). */
          variant === "userNav" && "flex min-w-0 flex-col items-stretch",
          className
        )}
        sideOffset={sideOffset}
        showArrow={showArrow}
      >
        {items.map((item, index) => {
          if (item.separator) {
            return <DropdownMenuSeparator key={`separator-${index}`} />;
          }

          const rowGap =
            userNavMeta != null
              ? walletGlassMenuItemRowSpacing(
                  userNavMeta.indexById.get(item.id) ?? 0,
                  userNavMeta.total
                )
              : "";

          const itemClasses =
            variant === "userNav"
              ? item.content
                ? cn("block w-full min-w-0", rowGap, item.className)
                : cn(
                    WALLET_GLASS_MENU_ITEM_ROW_BASE,
                    "!flex w-full min-w-0 max-w-full items-center gap-2",
                    rowGap,
                    item.variant === "danger"
                      ? WALLET_GLASS_MENU_ITEM_ROW_DANGER
                      : WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
                    item.className
                  )
              : cn(
                  "flex items-center gap-2",
                  item.variant === "danger" &&
                    "!text-[var(--color-error)] focus:!text-[var(--color-error)] focus:!bg-[var(--color-error)]/15 dark:focus:!bg-[var(--color-error)]/15",
                  item.className
                );

          return (
            <DropdownMenuItem
              key={item.id}
              onClick={item.onClick}
              disabled={item.disabled}
              className={itemClasses}
              onSelect={
                item.preventClose
                  ? (event) => event.preventDefault()
                  : undefined
              }
              asChild={!!item.href}
            >
              {item.href ? (
                <Link
                  href={item.href}
                  className={cn(
                    "flex w-full min-w-0 max-w-full items-center justify-start gap-2",
                    variant === "userNav" && "rounded-[inherit]"
                  )}
                >
                  <span className="flex shrink-0 items-center justify-center" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                </Link>
              ) : item.content ? (
                item.content
              ) : (
                <>
                  <span className="flex shrink-0 items-center justify-center" aria-hidden>
                    {item.icon}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-left",
                      variant === "userNav" && "truncate"
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
