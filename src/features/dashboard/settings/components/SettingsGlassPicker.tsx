"use client";

import { ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SETTINGS_GLASS_MENU_CONTENT_CLASS,
  SETTINGS_GLASS_MENU_ITEM_IDLE,
  SETTINGS_GLASS_MENU_ITEM_SELECTED,
  SETTINGS_SELECT_TRIGGER_CLASS,
} from "@/features/dashboard/settings/settingsStyles";
import { cn } from "@/lib/utils";

export interface SettingsGlassPickerOption {
  value: string;
  label: string;
}

interface SettingsGlassPickerProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SettingsGlassPickerOption[];
 /** Merged into trigger button */
  triggerClassName?: string;
  ariaLabel?: string;
}

/**
 * Settings row picker - wallet glass dropdown (sort/filter menu pattern).
 * Do not use Radix Select here; its default panel styles fight WALLET_GLASS_MENU_CONTENT.
 */
export function SettingsGlassPicker({
  value,
  onValueChange,
  options,
  triggerClassName,
  ariaLabel = "Select option",
}: SettingsGlassPickerProps) {
  const selectedLabel =
    options.find((opt) => opt.value === value)?.label ?? value;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(SETTINGS_SELECT_TRIGGER_CLASS, triggerClassName)}
          aria-label={ariaLabel}
        >
          <span className="min-w-0 truncate text-left">{selectedLabel}</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 opacity-50 text-[var(--color-text-muted)]"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={cn(
          SETTINGS_GLASS_MENU_CONTENT_CLASS,
          "w-[var(--radix-dropdown-menu-trigger-width)]"
        )}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              textValue={option.label}
              onSelect={() => onValueChange(option.value)}
              className={
                selected
                  ? SETTINGS_GLASS_MENU_ITEM_SELECTED
                  : SETTINGS_GLASS_MENU_ITEM_IDLE
              }
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {selected ? (
                  <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                ) : null}
              </span>
              <span className="min-w-0 truncate text-left">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
