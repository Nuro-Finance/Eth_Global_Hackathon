import { FieldError } from "react-hook-form";
import { DatePicker as BaseDatePicker } from "@/components/date-picker";

interface DatePickerProps {
  value?: Date;
  onSelect: (date: Date | undefined) => void;
  error?: FieldError;
  placeholder: string;
  label: string;
}

export function DatePicker({
  value,
  onSelect,
  error,
  placeholder,
  label,
}: DatePickerProps) {
  return (
    <BaseDatePicker
      value={value}
      onChange={onSelect}
      placeholder={placeholder}
      label={`${label} *`}
      errorMessage={error?.message}
    />
  );
}
