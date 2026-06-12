"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Check } from "lucide-react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";

interface SimpleDateRangeDialogProps {
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

export function SimpleDateRangeDialog({
  onDateRangeSelect,
  open,
  onOpenChange,
  trigger,
  initialDateRange,
}: SimpleDateRangeDialogProps) {
  const t = useTranslations("Transactions");
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(
    initialDateRange?.from ? format(initialDateRange.from, "yyyy-MM-dd") : ""
  );
  const [endDate, setEndDate] = useState(
    initialDateRange?.to ? format(initialDateRange.to, "yyyy-MM-dd") : ""
  );

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setIsOpen(newOpen);
    }

    if (!newOpen) {
      resetDates();
    }
  };

  const resetDates = () => {
    setStartDate("");
    setEndDate("");
  };

  const handleApplyDateRange = () => {
    if (startDate && endDate) {
      const dateRange: DateRange = {
        from: new Date(startDate),
        to: new Date(endDate),
      };
      onDateRangeSelect?.(dateRange);
      handleOpenChange(false);
    }
  };

  const isDateRangeValid =
    startDate && endDate && new Date(startDate) <= new Date(endDate);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("selectDateRange") || "Select Date Range"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">{t("startDate") || "Start Date"}</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">{t("endDate") || "End Date"}</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full"
              min={startDate} // Ensure end date is not before start date
            />
          </div>
          {startDate && endDate && new Date(startDate) > new Date(endDate) && (
            <p className="text-sm text-[var(--color-error)]">
              End date must be after start date
            </p>
          )}
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
