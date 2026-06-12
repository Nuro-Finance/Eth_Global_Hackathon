"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface InputOTPProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

export function InputOTP({
  value,
  onChange,
  maxLength = 6,
  disabled = false,
}: InputOTPProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value;
    if (val.length > 1) {
      // Handle paste
      const pastedData = val.slice(0, maxLength);
      onChange(pastedData);
      return;
    }

    const newValue = value.split("");
    newValue[index] = val;
    const combinedValue = newValue.join("");
    onChange(combinedValue);

    // Auto-focus next input
    if (val && index < maxLength - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: maxLength }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          disabled={disabled}
          className={cn(
            "w-10 h-11 text-center text-xl font-bold rounded-[var(--radius-md)] border border-[var(--color-border-input)] bg-white/[0.05] backdrop-blur-[var(--glass-blur)] text-[var(--color-text-primary)] focus:border-[var(--color-border-input-focus)] focus:outline-none transition-all duration-200",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
}
