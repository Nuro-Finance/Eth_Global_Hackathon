"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, inputVariants } from "@/components/ui/Input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// You'll need to install: npm install react-phone-number-input libphonenumber-js
import {
  type Value as PhoneValue,
  type Country,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumber,
  isValidPhoneNumber,
} from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

interface PhoneInputProps {
  value?: PhoneValue;
  onChange?: (value: PhoneValue) => void;
  defaultCountry?: Country;
  countries?: Country[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  errorMessage?: string;
  helperText?: string;
  defaultErrorMessage?: string;
}

const PhoneInput = React.forwardRef<HTMLDivElement, PhoneInputProps>(
  (
    {
      value,
      onChange,
      defaultCountry = "US",
      countries = getCountries(),
      placeholder = "Enter phone number",
      disabled = false,
      className,
      label,
      errorMessage,
      helperText,
      defaultErrorMessage = "Please enter a valid phone number",
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [selectedCountry, setSelectedCountry] =
      React.useState<Country>(defaultCountry);
    const [phoneNumber, setPhoneNumber] = React.useState<
      PhoneValue | undefined
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
          country.toLowerCase().includes(searchQuery.toLowerCase()) ||
          `+${getCountryCallingCode(country)}`.includes(searchQuery)
        );
      });
    }, [countries, searchQuery]);

 // Handle country selection
    const handleCountrySelect = (country: Country) => {
      setSelectedCountry(country);
      setIsOpen(false);
      setSearchQuery("");

 // Update phone number with new country
      if (phoneNumber) {
        try {
          const parsed = parsePhoneNumber(phoneNumber);
          if (parsed) {
            const newNumber = `+${getCountryCallingCode(country)}${
              parsed.nationalNumber
            }`;
            setPhoneNumber(newNumber as PhoneValue);
            onChange?.(newNumber as PhoneValue);
          }
        } catch {
 // If parsing fails, just set the country code
          const newNumber = `+${getCountryCallingCode(country)}` as PhoneValue;
          setPhoneNumber(newNumber);
          onChange?.(newNumber);
        }
      }
    };

 // Handle phone number change
    const handlePhoneChange = (newValue: PhoneValue) => {
      setPhoneNumber(newValue);
      onChange?.(newValue);

 // Auto-detect country from phone number
      if (newValue) {
        try {
          const parsed = parsePhoneNumber(newValue);
          if (parsed && parsed.country && parsed.country !== selectedCountry) {
            setSelectedCountry(parsed.country);
          }
        } catch {
 // Ignore parsing errors
        }
      }
    };

 // Get country flag component - rectangle style (consistent app-wide)
    const getCountryFlag = (country: Country) => {
      const Flag = flags[country];
      return Flag ? (
        <div className="w-6 h-4 shrink-0 overflow-hidden rounded-[2px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full">
          <Flag title={country} />
        </div>
      ) : (
        <span className="text-sm">{country}</span>
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

 // Validate phone number
    const isValid = phoneNumber ? isValidPhoneNumber(phoneNumber) : true;
    const hasError = errorMessage || (!isValid && phoneNumber);

 // Update internal state when external value changes
    React.useEffect(() => {
      if (value !== undefined) {
        setPhoneNumber(value);
      }
    }, [value]);

    return (
      <div ref={ref} className={cn("w-full", className)}>
        {label && (
          <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-8">
            {label}
          </label>
        )}

        <div className="relative" dir="ltr">
          <div className="flex">
            {/* Country Selector */}
            <Popover open={isOpen} onOpenChange={setIsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  className={cn(
                    inputVariants({
                      size: "md",
                      state: hasError ? "error" : "default",
                    }),
                    "w-auto border-r-0 rounded-r-none px-3 flex items-center gap-1 cursor-pointer hover:bg-[var(--color-bg-hover)] !backdrop-blur-none"
                  )}
                >
                  {getCountryFlag(selectedCountry)}
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    +{getCountryCallingCode(selectedCountry)}
                  </span>
                  <ChevronDown className="w-4 h-4 ml-1 opacity-50" />
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
                          <div className="text-[11px] text-[var(--color-text-muted)]">
                            +{getCountryCallingCode(country)}
                          </div>
                        </div>
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

            {/* Phone Number Input */}
            <div className="flex-1 relative">
              <input
                type="tel"
                value={phoneNumber || ""}
                onChange={(e) =>
                  handlePhoneChange(e.target.value as PhoneValue)
                }
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                  inputVariants({
                    size: "md",
                    state: hasError ? "error" : "default",
                  }),
                  "rounded-l-none rounded-r-lg !backdrop-blur-none"
                )}
              />
            </div>
          </div>
        </div>

        {/* Error/Helper Text */}
        {hasError && (
          <p className="mt-1 text-sm text-[var(--color-error)]">
            {errorMessage || defaultErrorMessage}
          </p>
        )}
        {helperText && !hasError && (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput, type PhoneInputProps };
