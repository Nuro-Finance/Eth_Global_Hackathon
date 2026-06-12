import { useTranslations } from "next-intl";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface SheetHeaderProps {
  side: "left" | "right";
  children: React.ReactNode;
}

export function QuickTransferSheetHeader() {
  const t = useTranslations();

  return (
    <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--color-border-primary)]">
      <SheetTitle className="text-xl font-semibold text-[var(--color-text-primary)]">
        Quick Reload
      </SheetTitle>
      <SheetDescription className="text-sm text-[var(--color-text-muted)] mt-2">
        {t("Dashboard.quickTransferDescription") ||
          "Send money quickly and securely to any account worldwide."}
      </SheetDescription>
    </SheetHeader>
  );
}
