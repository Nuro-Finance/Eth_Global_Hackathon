"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";

interface TransferButtonProps {
  t: (key: string) => string;
  onTransfer: () => void;
  sending: boolean;
  status: "idle" | "success" | "error";
  disabled: boolean;
}

export function TransferButton({ t, onTransfer, sending, status, disabled }: TransferButtonProps) {
  const label = status === "success" ? "Sent!" : status === "error" ? "Failed" : (t("Dashboard.transfer") || "Transfer");

  return (
    <div style={{ marginBlockStart: "8px" }}>
      <Button
        variant="default"
        size="default"
        className={`w-full rounded-[var(--radius-md)] text-xs sm:text-sm transition-all ${status === "success" ? "bg-green-600 hover:bg-green-600" : status === "error" ? "bg-red-600 hover:bg-red-600" : ""}`}
        onClick={onTransfer}
        disabled={disabled || sending}
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === "success" ? (
          <Check className="w-4 h-4 mr-1" />
        ) : status === "error" ? (
          <X className="w-4 h-4 mr-1" />
        ) : null}
        <span className="text-[var(--color-button-text)] text-[13px] sm:text-[14px] font-medium">
          {label}
        </span>
      </Button>
    </div>
  );
}
