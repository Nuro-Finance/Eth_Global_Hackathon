"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import DemoCard from "../DemoCard";

export default function CheckboxDemo() {
  const t = useTranslations("UIComponent");
  const [checked1, setChecked1] = useState(false);
  const [checked2, setChecked2] = useState(true);
  const [items, setItems] = useState({
    terms: false,
    marketing: true,
    analytics: false,
  });

  return (
    <DemoCard
      title={t("checkbox.title")}
      description={t("checkbox.description")}
    >
      {/* Basic Checkbox */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("checkbox.basicCheckbox")}
        </h4>
        <div className="flex items-center gap-2">
          <Checkbox
            id="basic"
            checked={checked1}
            onCheckedChange={(checked) => setChecked1(checked as boolean)}
          />
          <Label
            htmlFor="basic"
            className="text-sm text-[var(--color-text-primary)] cursor-pointer"
          >
            {t("checkbox.acceptTerms")}
          </Label>
        </div>
      </div>

      {/* Checked State */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("checkbox.defaultChecked")}
        </h4>
        <div className="flex items-center gap-2">
          <Checkbox
            id="checked"
            checked={checked2}
            onCheckedChange={(checked) => setChecked2(checked as boolean)}
          />
          <Label
            htmlFor="checked"
            className="text-sm text-[var(--color-text-primary)] cursor-pointer"
          >
            {t("checkbox.enableNotifications")}
          </Label>
        </div>
      </div>

      {/* Disabled States */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("checkbox.disabledStates")}
        </h4>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="disabled-unchecked" disabled />
            <Label
              htmlFor="disabled-unchecked"
              className="text-sm text-[var(--color-text-muted)] cursor-not-allowed"
            >
              {t("checkbox.disabledUnchecked")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="disabled-checked" disabled checked />
            <Label
              htmlFor="disabled-checked"
              className="text-sm text-[var(--color-text-muted)] cursor-not-allowed"
            >
              {t("checkbox.disabledChecked")}
            </Label>
          </div>
        </div>
      </div>

      {/* Checkbox Group */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("checkbox.checkboxGroup")}
        </h4>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="terms"
              checked={items.terms}
              onCheckedChange={(checked) =>
                setItems((prev) => ({ ...prev, terms: checked as boolean }))
              }
            />
            <Label
              htmlFor="terms"
              className="text-sm text-[var(--color-text-primary)] cursor-pointer"
            >
              {t("checkbox.agreeToTerms")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="marketing"
              checked={items.marketing}
              onCheckedChange={(checked) =>
                setItems((prev) => ({ ...prev, marketing: checked as boolean }))
              }
            />
            <Label
              htmlFor="marketing"
              className="text-sm text-[var(--color-text-primary)] cursor-pointer"
            >
              {t("checkbox.sendMarketingEmails")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="analytics"
              checked={items.analytics}
              onCheckedChange={(checked) =>
                setItems((prev) => ({ ...prev, analytics: checked as boolean }))
              }
            />
            <Label
              htmlFor="analytics"
              className="text-sm text-[var(--color-text-primary)] cursor-pointer"
            >
              {t("checkbox.allowAnalytics")}
            </Label>
          </div>
        </div>
      </div>

      {/* With Description */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("checkbox.withDescription")}
        </h4>
        <div className="flex items-start gap-2">
          <Checkbox id="with-desc" className="mt-1" />
          <div>
            <Label
              htmlFor="with-desc"
              className="text-sm text-[var(--color-text-primary)] cursor-pointer"
            >
              {t("checkbox.rememberMe")}
            </Label>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("checkbox.saveLoginDetails")}
            </p>
          </div>
        </div>
      </div>
    </DemoCard>
  );
}
