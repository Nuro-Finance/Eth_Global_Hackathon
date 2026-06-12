import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetFooterProps {
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export function SheetFooter({
  isSubmitting,
  onCancel,
  onSubmit,
}: SheetFooterProps) {
  const t = useTranslations();

  return (
    <div className="px-6 py-4 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] flex flex-col sm:flex-row gap-3">
      <Button
        variant="outline"
        onClick={onCancel}
        disabled={isSubmitting}
        className="flex-1 h-11 bg-transparent border-[var(--color-border-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        {t("Dashboard.cancel") || "Cancel"}
      </Button>
      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        className="flex-1 h-11 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-[var(--color-button-text)] font-medium"
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSubmitting
          ? t("Dashboard.processing") || "Processing..."
          : t("Dashboard.initiateTransfer") || "Initiate Transfer"}
      </Button>
    </div>
  );
}
