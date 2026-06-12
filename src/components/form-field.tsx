import React from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  description,
  children,
  className,
}) => {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col items-center text-center sm:items-start sm:text-left space-y-1">
        <label className="text-[14px] font-medium text-[var(--color-text-primary)]">
          {label}
        </label>
        {description && (
          <p className="text-[12px] text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
};

export default FormField;
