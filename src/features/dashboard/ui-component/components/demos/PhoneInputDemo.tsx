"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { PhoneInput } from "@/components/PhoneInput";
import type { Value as PhoneValue } from "react-phone-number-input";
import DemoCard from "../DemoCard";

export default function PhoneInputDemo() {
  const t = useTranslations("UIComponent");
  const [phone1, setPhone1] = useState<PhoneValue | undefined>(undefined);
  const [phone2, setPhone2] = useState<PhoneValue | undefined>(
    "+15551234567" as PhoneValue
  );
  const [phone3, setPhone3] = useState<PhoneValue | undefined>(undefined);

  return (
    <DemoCard
      title={t("phoneInput.title")}
      description={t("phoneInput.description")}
    >
      {/* Basic Phone Input */}
      <div className="max-w-sm">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("phoneInput.basicPhoneInput")}
        </h4>
        <PhoneInput
          value={phone1}
          onChange={setPhone1}
          placeholder={t("phoneInput.enterPhoneNumber")}
        />
        {phone1 && (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t("phoneInput.value")}: {phone1}
          </p>
        )}
      </div>

      {/* With Default Value */}
      <div className="max-w-sm">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("phoneInput.withDefaultValue")}
        </h4>
        <PhoneInput value={phone2} onChange={setPhone2} />
      </div>

      {/* Default Country */}
      <div className="max-w-sm">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("phoneInput.defaultCountry")}
        </h4>
        <PhoneInput
          value={phone3}
          onChange={setPhone3}
          defaultCountry="GB"
          placeholder={t("phoneInput.enterUKNumber")}
        />
      </div>

      {/* Disabled State */}
      <div className="max-w-sm">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("phoneInput.disabledState")}
        </h4>
        <PhoneInput
          value={"+15559998888" as PhoneValue}
          onChange={() => {}}
          disabled
        />
      </div>

      {/* In a Form Context */}
      <div className="max-w-sm">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("phoneInput.formExample")}
        </h4>
        <div className="space-y-4 p-4 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">
              {t("phoneInput.contactPhone")}
            </label>
            <PhoneInput
              value={phone1}
              onChange={setPhone1}
              placeholder={t("phoneInput.yourPhoneNumber")}
              defaultErrorMessage={t("phoneInput.validPhoneError")}
            />
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("phoneInput.contactAboutOrder")}
            </p>
          </div>
        </div>
      </div>
    </DemoCard>
  );
}
