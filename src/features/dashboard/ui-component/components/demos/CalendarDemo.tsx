"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar } from "@/components/calendar";
import DemoCard from "../DemoCard";

export default function CalendarDemo() {
  const t = useTranslations("UIComponent");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [disabledDemoDate, setDisabledDemoDate] = useState<Date | undefined>();
  const [multiMonthDate, setMultiMonthDate] = useState<Date | undefined>();

  return (
    <DemoCard
      title={t("calendar.title")}
      description={t("calendar.description")}
    >
      {/* Single Date Selection */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("calendar.singleDateSelection")}
        </h4>
        <div className="inline-block rounded-lg border border-[var(--color-border-primary)] p-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            showOutsideDays={true}
          />
        </div>
        {selectedDate && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            {t("calendar.selected")}: {selectedDate.toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Disabled Dates */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("calendar.disabledPastDates")}
        </h4>
        <div className="inline-block rounded-lg border border-[var(--color-border-primary)] p-3">
          <Calendar
            mode="single"
            selected={disabledDemoDate}
            onSelect={setDisabledDemoDate}
            showOutsideDays={true}
            disabled={(date) =>
              date < new Date(new Date().setHours(0, 0, 0, 0))
            }
          />
        </div>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {t("calendar.pastDatesDisabled")}
        </p>
      </div>

      {/* Multiple Months */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("calendar.multipleMonthsView")}
        </h4>
        <div className="inline-block rounded-lg border border-[var(--color-border-primary)] p-3 overflow-x-auto">
          <Calendar
            mode="single"
            numberOfMonths={3}
            selected={multiMonthDate}
            onSelect={setMultiMonthDate}
            showOutsideDays={true}
          />
        </div>
      </div>
    </DemoCard>
  );
}
