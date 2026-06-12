"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { DatePicker } from "@/components/date-picker";
import { DateRangePicker } from "@/components/dateRangePicker";
import type { DateRange } from "react-day-picker";
import DemoCard from "../DemoCard";

export default function DatePickerDemo() {
  const t = useTranslations("UIComponent");
  const tc = useTranslations();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [dateWithTime, setDateWithTime] = useState<Date | undefined>(
    new Date()
  );
  const [birthdayDate, setBirthdayDate] = useState<Date | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  return (
    <DemoCard
      title={t("datePicker.title")}
      description={t("datePicker.description")}
    >
      {/* Basic Date Picker */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("datePicker.basicDatePicker")}
        </h4>
        <DatePicker
          value={date}
          onChange={setDate}
          placeholder={t("datePicker.selectDate")}
          label={t("datePicker.selectDate")}
        />
        {date && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t("datePicker.selected")}: {date.toLocaleDateString()}
          </p>
        )}
      </div>

      {/* With Default Value */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("datePicker.withDefaultValue")}
        </h4>
        <DatePicker
          value={dateWithTime}
          onChange={setDateWithTime}
          label={t("datePicker.withDefaultValue")}
        />
      </div>

      {/* Date Range Picker */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("datePicker.dateRangePicker")}
        </h4>
        <DateRangePicker
          date={dateRange}
          onDateChange={setDateRange}
          className="w-full"
          placeholder={tc("Dashboard.selectTimeRange") || "Select time range"}
          translations={{
            custom: tc("DateRange.custom") || "Custom",
            today: tc("DateRange.today") || "Today",
            yesterday: tc("DateRange.yesterday") || "Yesterday",
            last7Days: tc("DateRange.last7Days") || "Last 7 days",
            last28Days: tc("DateRange.last28Days") || "Last 28 days",
            last30Days: tc("DateRange.last30Days") || "Last 30 days",
            thisMonth: tc("DateRange.thisMonth") || "This Month",
            lastMonth: tc("DateRange.lastMonth") || "Last Month",
            quickSelect: tc("DateRange.quickSelect") || "Quick Select",
            from: tc("DateRange.from") || "From",
            to: tc("DateRange.to") || "To",
            selectDate: tc("DateRange.selectDate") || "Select date",
            daysSelected: tc("DateRange.daysSelected") || "days selected",
            cancel: tc("DateRange.cancel") || "Cancel",
            apply: tc("DateRange.apply") || "Apply",
          }}
        />
        {dateRange?.from && dateRange?.to && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t("datePicker.range")}: {dateRange.from.toLocaleDateString()} -{" "}
            {dateRange.to.toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Disabled State */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("datePicker.disabledState")}
        </h4>
        <DatePicker value={new Date()} onChange={() => {}} disabled />
      </div>

      {/* Custom Placeholder */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("datePicker.customPlaceholder")}
        </h4>
        <DatePicker
          value={birthdayDate}
          onChange={setBirthdayDate}
          placeholder={t("datePicker.chooseBirthday")}
          label={t("datePicker.chooseBirthday")}
        />
        {birthdayDate && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t("datePicker.selected")}: {birthdayDate.toLocaleDateString()}
          </p>
        )}
      </div>
    </DemoCard>
  );
}
