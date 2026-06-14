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

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, maxLength);
    if (!pasted) return;
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, maxLength) - 1;
    requestAnimationFrame(() => {
      inputRefs.current[focusIndex]?.focus();
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value.replace(/\D/g, "");
    if (val.length > 1) {
      const pastedData = val.slice(0, maxLength);
      onChange(pastedData);
      const focusIndex = Math.min(pastedData.length, maxLength) - 1;
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    const newValue = value.split("");
    while (newValue.length < maxLength) newValue.push("");
    newValue[index] = val.slice(-1);
    onChange(newValue.join("").slice(0, maxLength));

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
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: maxLength }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="tel"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          name={`otp-digit-${i}`}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          readOnly
          onFocus={(e) => {
            e.target.removeAttribute("readonly");
          }}
          value={value[i] || ""}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
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
