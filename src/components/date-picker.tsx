"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { inputVariants } from "@/components/ui/Input";
import { Calendar } from "@/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  errorMessage?: string;
  helperText?: string;
}

const DatePicker = React.forwardRef<HTMLDivElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      placeholder = "Pick a date",
      disabled = false,
      className,
      label,
      errorMessage,
      helperText,
    },
    ref
  ) => {
    const [date, setDate] = React.useState<Date | undefined>(value);
    const locale = useLocale();

    const handleDateChange = (newDate: Date | undefined) => {
      setDate(newDate);
      onChange?.(newDate);
    };

    // Update internal state when external value changes
    React.useEffect(() => {
      setDate(value);
    }, [value]);

    return (
      <div ref={ref} className={cn("w-full", className)}>
        {label && (
          <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-8">
            {label}
          </label>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                inputVariants({
                  size: "md",
                  state: errorMessage ? "error" : "default",
                }),
                "w-full justify-start text-start font-normal flex items-center cursor-pointer !backdrop-blur-none",
                disabled && "opacity-50 cursor-not-allowed",
                !date && "text-[var(--color-text-placeholder)]"
              )}
            >
              <CalendarIcon className="me-2 h-4 w-4 shrink-0" />
              <span className="truncate">
                {date
                  ? new Intl.DateTimeFormat(locale, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    }).format(date)
                  : placeholder}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateChange}
              disabled={disabled}
              showOutsideDays={false}
              captionLayout="dropdown"
              fromYear={1900}
              toYear={2030}
              className="[&_.rdp-month]:space-y-2"
            />
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

DatePicker.displayName = "DatePicker";

export { DatePicker, type DatePickerProps };
