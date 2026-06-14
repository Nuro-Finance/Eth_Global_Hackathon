"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input, inputVariants } from "@/components/ui/Input";
import {
  COMPACT_GLASS_SHELL_INNER_CLASS,
  COMPACT_GLASS_SHELL_INNER_STYLE,
  COMPACT_GLASS_SHELL_OUTER_CLASS,
  COMPACT_GLASS_SHELL_OUTER_STYLE,
} from "@/components/ui/modalPresets";
import { SETTINGS_INPUT_CLASS } from "@/features/dashboard/settings/settingsStyles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getCountries, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

interface CountrySelectProps {
  value?: Country;
  onChange?: (country: Country | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  popoverContentClassName?: string;
  popoverSide?: "top" | "bottom";
  label?: string;
  errorMessage?: string;
  helperText?: string;
  countries?: Country[];
}

const countryPickerInnerStyle = {
  ...COMPACT_GLASS_SHELL_INNER_STYLE,
  backgroundColor: "rgba(255, 255, 255, 0.03)",
};

const COUNTRY_PICKER_LIST_HEIGHT_PX = 220;

/** Strip Radix popover chrome - glass shell is the only visible panel (same as notifications dropdown). */
const COUNTRY_PICKER_POPOVER_RESET = cn(
  "z-[120] w-[var(--radix-popover-trigger-width)] !max-w-[var(--radix-popover-trigger-width)]",
  "!rounded-none !border-0 !bg-transparent !p-0 !shadow-none !backdrop-blur-none",
  "dark:!border-transparent overflow-visible",
);

const countryPickerOuterClassName = cn(
  "w-full",
  COMPACT_GLASS_SHELL_OUTER_CLASS,
  "!backdrop-blur-[var(--glass-blur-modal)] backdrop-saturate-[1.35]",
);

const COUNTRY_PICKER_SEARCH_CLASS = cn(
  SETTINGS_INPUT_CLASS,
  "!h-9 !border-transparent focus:!border-white/20 focus-visible:!border-white/20",
  "focus:ring-0 focus-visible:ring-0",
);

const CountrySelect = React.forwardRef<HTMLDivElement, CountrySelectProps>(
  (
    {
      value,
      onChange,
      placeholder = "Select country",
      disabled = false,
      className,
      popoverContentClassName,
      popoverSide = "top",
      label,
      errorMessage,
      helperText,
      countries = getCountries(),
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [selectedCountry, setSelectedCountry] = React.useState<
      Country | undefined
    >(value);

 // Filter countries based on search
    const filteredCountries = React.useMemo(() => {
      if (!searchQuery) return countries;
      return countries.filter((country) => {
        const countryName = new Intl.DisplayNames(["en"], {
          type: "region",
        }).of(country);
        return (
          countryName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          country.toLowerCase().includes(searchQuery.toLowerCase())
        );
      });
    }, [countries, searchQuery]);

 // Handle country selection
    const handleCountrySelect = (country: Country) => {
      setSelectedCountry(country);
      setIsOpen(false);
      setSearchQuery("");
      onChange?.(country);
    };

 // Get country flag component - same rectangle style as PhoneInput
    const getCountryFlag = (country: Country) => {
      const Flag = flags[country];
      return Flag ? (
        <div className="w-6 h-4 shrink-0 overflow-hidden rounded-[2px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full">
          <Flag title={country} />
        </div>
      ) : (
        <span className="text-sm text-[var(--color-text-muted)]">
          {country}
        </span>
      );
    };

 // Get country name
    const getCountryName = (country: Country) => {
      try {
        return (
          new Intl.DisplayNames(["en"], { type: "region" }).of(country) ||
          country
        );
      } catch {
        return country;
      }
    };

 // Update internal state when external value changes
    React.useEffect(() => {
      setSelectedCountry(value);
    }, [value]);

    return (
      <div ref={ref} className={cn("w-full", className)}>
        {label && (
          <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-8">
            {label}
          </label>
        )}

        <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                inputVariants({
                  size: "md",
                  state: errorMessage ? "error" : "default",
                }),
                "w-full justify-between flex items-center cursor-pointer !backdrop-blur-none",
                !selectedCountry && "text-[var(--color-text-placeholder)]"
              )}
            >
              <div className="flex items-center gap-2">
                {selectedCountry ? (
                  <>
                    {getCountryFlag(selectedCountry)}
                    <span>{getCountryName(selectedCountry)}</span>
                  </>
                ) : (
                  <span>{placeholder}</span>
                )}
              </div>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side={popoverSide}
            sideOffset={8}
            avoidCollisions={false}
            className={cn(COUNTRY_PICKER_POPOVER_RESET, popoverContentClassName)}
            style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0 }}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className={countryPickerOuterClassName} style={COMPACT_GLASS_SHELL_OUTER_STYLE}>
              <div
                className={COMPACT_GLASS_SHELL_INNER_CLASS}
                style={countryPickerInnerStyle}
              >
                <div className="px-4 pt-4 pb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search countries..."
                      className={cn(COUNTRY_PICKER_SEARCH_CLASS, "pl-10")}
                    />
                  </div>
                </div>

                <div
                  className="overflow-y-auto overscroll-contain px-2 pb-3 scrollbar-autohide"
                  style={{
                    height: COUNTRY_PICKER_LIST_HEIGHT_PX,
                    minHeight: COUNTRY_PICKER_LIST_HEIGHT_PX,
                    maxHeight: COUNTRY_PICKER_LIST_HEIGHT_PX,
                  }}
                >
                  {filteredCountries.length > 0 ? (
                    filteredCountries.map((country) => (
                      <button
                        key={country}
                        type="button"
                        onClick={() => handleCountrySelect(country)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-all duration-200",
                          selectedCountry === country
                            ? "bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]"
                            : "text-[var(--color-text-primary)]/80 hover:bg-[var(--color-bg-hover)]/40 hover:text-[var(--color-text-primary)]",
                        )}
                      >
                        {getCountryFlag(country)}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">
                            {getCountryName(country)}
                          </div>
                        </div>
                        {selectedCountry === country ? (
                          <Check className="ml-auto h-4 w-4 text-[var(--color-primary)]" />
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-center text-sm text-[var(--color-text-muted)]">
                      No countries found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Error/Helper Text */}
        {errorMessage && (
          <p className="mt-1 text-sm text-[var(--color-error)]">
            {errorMessage}
          </p>
        )}
        {helperText && !errorMessage && (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

CountrySelect.displayName = "CountrySelect";

export { CountrySelect, type CountrySelectProps };
