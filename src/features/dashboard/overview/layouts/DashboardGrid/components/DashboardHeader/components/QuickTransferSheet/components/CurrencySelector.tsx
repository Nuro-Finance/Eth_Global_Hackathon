import { FieldError } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CURRENCY_OPTIONS } from "../config";

interface CurrencySelectorProps {
  error?: FieldError;
  onValueChange: (value: string) => void;
  placeholder: string;
}

export function CurrencySelector({
  error,
  onValueChange,
  placeholder,
}: CurrencySelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-[var(--color-text-secondary)]">
        Currency *
      </Label>
      <Select onValueChange={onValueChange}>
        <SelectTrigger
          className={cn(
            "h-12 bg-[var(--color-bg-input)] border-[var(--color-border-input)] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20",
            error && "border-[var(--color-error)] focus:border-[var(--color-error)]"
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)]">
          {CURRENCY_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-sm text-[var(--color-error)] flex items-center gap-1">
          <span className="text-xs">⚠</span>
          {error.message}
        </p>
      )}
    </div>
  );
}
