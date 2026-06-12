"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import DemoCard from "../DemoCard";

export default function SwitchDemo() {
  const t = useTranslations("UIComponent");
  const [switches, setSwitches] = useState({
    default: false,
    checked: true,
    small: true,
    medium: false,
    large: false,
    disabled: true,
  });

  const handleChange = (key: keyof typeof switches) => () => {
    setSwitches((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <DemoCard title={t("switch.title")} description={t("switch.description")}>
      {/* Basic Switch */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("switch.basicSwitch")}
        </h4>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={switches.default}
              onChange={handleChange("default")}
            />
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("switch.default")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={switches.checked}
              onChange={handleChange("checked")}
            />
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("switch.checked")}
            </span>
          </div>
        </div>
      </div>

      {/* Sizes */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("switch.sizes")}
        </h4>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={switches.small}
              onChange={handleChange("small")}
            />
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("switch.small")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              size="md"
              checked={switches.medium}
              onChange={handleChange("medium")}
            />
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("switch.medium")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              size="lg"
              checked={switches.large}
              onChange={handleChange("large")}
            />
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("switch.large")}
            </span>
          </div>
        </div>
      </div>

      {/* Disabled State */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("switch.disabledState")}
        </h4>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch disabled checked={false} onChange={() => {}} />
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("switch.disabledOff")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Switch disabled checked={switches.disabled} onChange={() => {}} />
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("switch.disabledOn")}
            </span>
          </div>
        </div>
      </div>
    </DemoCard>
  );
}
