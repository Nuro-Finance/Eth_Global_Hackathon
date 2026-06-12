"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { CountrySelect } from "@/components/country-select";
import type { Country } from "react-phone-number-input";
import DemoCard from "../DemoCard";

export default function CountrySelectDemo() {
  const t = useTranslations("UIComponent");
  const [country1, setCountry1] = useState<Country | undefined>(undefined);
  const [country2, setCountry2] = useState<Country | undefined>("US");

  return (
    <DemoCard
      title={t("countrySelect.title")}
      description={t("countrySelect.description")}
    >
      {/* Basic Country Select */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("countrySelect.basicCountrySelect")}
        </h4>
        <CountrySelect
          value={country1}
          onChange={setCountry1}
          placeholder={t("countrySelect.selectCountry")}
        />
        {country1 && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t("countrySelect.selected")}: {country1}
          </p>
        )}
      </div>

      {/* With Default Value */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("countrySelect.withDefaultValue")}
        </h4>
        <CountrySelect value={country2} onChange={setCountry2} />
      </div>

      {/* Disabled State */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("countrySelect.disabledState")}
        </h4>
        <CountrySelect value="GB" onChange={() => {}} disabled />
      </div>

      {/* In Form Context */}
      <div className="max-w-sm">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("countrySelect.formExample")}
        </h4>
        <div className="space-y-4 p-4 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">
              {t("countrySelect.countryOfResidence")}
            </label>
            <CountrySelect
              value={country1}
              onChange={setCountry1}
              placeholder={t("countrySelect.whereDoYouLive")}
            />
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("countrySelect.customizeExperience")}
            </p>
          </div>
        </div>
      </div>
    </DemoCard>
  );
}
