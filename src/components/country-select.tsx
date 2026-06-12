"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, inputVariants } from "@/components/ui/Input";
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
  label?: string;
  errorMessage?: string;
  helperText?: string;
  countries?: Country[];
}

const CountrySelect = React.forwardRef<HTMLDivElement, CountrySelectProps>(
  (
    {
      value,
      onChange,
      placeholder = "Select country",
      disabled = false,
      className,
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

        <Popover open={isOpen} onOpenChange={setIsOpen}>
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
          <PopoverContent className="w-80 p-1 rounded-[16px] border-[var(--color-border-glass-strong)] dark:bg-[var(--color-bg-glass)]" align="start">
            {/* Search Input - Refined to match Example 2 spacing */}
            <div className="p-2 mb-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] z-10" />
                <Input
                  type="text"
                  variant="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search countries..."
                  size="sm"
                  className="pl-10 relative"
                />
              </div>
            </div>

            {/* Countries List - Padded for Example 2 feel */}
            <div className="max-h-[202px] overflow-y-auto px-1 pb-1">
              {filteredCountries.length > 0 ? (
                filteredCountries.map((country) => (
                  <button
                    key={country}
                    type="button"
                    onClick={() => handleCountrySelect(country)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left rounded-[10px] transition-all duration-200",
                      selectedCountry === country 
                        ? "bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]" 
                        : "hover:bg-[var(--color-bg-hover)]/40 text-[var(--color-text-primary)]/80 hover:text-[var(--color-text-primary)]"
                    )}
                  >
                    {getCountryFlag(country)}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        {getCountryName(country)}
                      </div>
                    </div>
                    {selectedCountry === country && (
                      <Check className="w-4 h-4 text-[var(--color-primary)] ml-auto" />
                    )}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-[var(--color-text-muted)] text-center">
                  No countries found
                </div>
              )}
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
