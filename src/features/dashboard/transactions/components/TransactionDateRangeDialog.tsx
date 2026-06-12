"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Check } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/dateRangePicker";

interface DateRangeDialogProps {
 /** Callback when date range is selected */
  onDateRangeSelect?: (dateRange: DateRange | undefined) => void;
 /** Whether the dialog is open */
  open?: boolean;
 /** Callback when dialog open state changes */
  onOpenChange?: (open: boolean) => void;
 /** Custom trigger element */
  trigger?: React.ReactNode;
 /** Initial date range */
  initialDateRange?: DateRange;
}

export function TransactionDateRangeDialog({
  onDateRangeSelect,
  open,
  onOpenChange,
  trigger,
  initialDateRange,
}: DateRangeDialogProps) {
  const t = useTranslations("Transactions");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<
    DateRange | undefined
  >(initialDateRange);

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setIsOpen(newOpen);
    }

    if (!newOpen) {
      setSelectedDateRange(undefined);
    }
  };

  const handleApplyDateRange = () => {
    if (selectedDateRange?.from && selectedDateRange?.to) {
      onDateRangeSelect?.(selectedDateRange);
      handleOpenChange(false);
    }
  };

  const isDateRangeValid = selectedDateRange?.from && selectedDateRange?.to;
  const actualOpen = open !== undefined ? open : isOpen;

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <Calendar className="w-4 h-4 me-2" />
      {t("dateRange")}
    </Button>
  );

  return (
    <Dialog open={actualOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[800px] max-w-[95vw] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {t("selectDateRange") || "Select Date Range"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-1">
          <div className="w-full overflow-hidden">
            <DateRangePicker
              date={selectedDateRange}
              onDateChange={setSelectedDateRange}
              placeholder={t("pickDateRange") || "Pick a date range"}
              className="w-full"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("cancel") || "Cancel"}
          </Button>
          <Button onClick={handleApplyDateRange} disabled={!isDateRangeValid}>
            <Check className="w-4 h-4 me-2" />
            {t("apply") || "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
