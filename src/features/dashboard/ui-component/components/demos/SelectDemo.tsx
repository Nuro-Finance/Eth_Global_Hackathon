"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import flags from "react-phone-number-input/flags";
import DemoCard from "../DemoCard";

const countryCodes = ["US", "GB", "CA", "AU", "DE", "FR", "JP"] as const;
const FlagRect = ({ country }: { country: (typeof countryCodes)[number] }) => {
  const Flag = flags[country];
  if (!Flag) return null;
  return (
    <div className="w-6 h-4 shrink-0 overflow-hidden rounded-[2px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full">
      <Flag title={country} />
    </div>
  );
};

export default function SelectDemo() {
  const t = useTranslations("UIComponent");
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("apple");

  return (
    <DemoCard title={t("select.title")} description={t("select.description")}>
      {/* Basic Select */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("select.basicSelect")}
        </h4>
        <Select value={value1} onValueChange={setValue1}>
          <SelectTrigger>
            <SelectValue placeholder={t("select.selectFruit")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">{t("select.apple")}</SelectItem>
            <SelectItem value="banana">{t("select.banana")}</SelectItem>
            <SelectItem value="orange">{t("select.orange")}</SelectItem>
            <SelectItem value="grape">{t("select.grape")}</SelectItem>
            <SelectItem value="mango">{t("select.mango")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* With Default Value */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("select.withDefaultValue")}
        </h4>
        <Select value={value2} onValueChange={setValue2}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">{t("select.apple")}</SelectItem>
            <SelectItem value="banana">{t("select.banana")}</SelectItem>
            <SelectItem value="orange">{t("select.orange")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Disabled */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("select.disabledState")}
        </h4>
        <Select disabled defaultValue="apple">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">{t("select.apple")}</SelectItem>
            <SelectItem value="banana">{t("select.banana")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* With Disabled Options */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("select.withDisabledOptions")}
        </h4>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder={t("select.selectStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("select.active")}</SelectItem>
            <SelectItem value="pending">{t("select.pending")}</SelectItem>
            <SelectItem value="inactive" disabled>
              {t("select.inactiveUnavailable")}
            </SelectItem>
            <SelectItem value="archived" disabled>
              {t("select.archivedUnavailable")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Common Use Case */}
      <div className="max-w-xs">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("select.countrySelection")}
        </h4>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder={t("select.selectCountry")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="us">
              <span className="flex items-center gap-2">
                <FlagRect country="US" />
                {t("select.unitedStates")}
              </span>
            </SelectItem>
            <SelectItem value="uk">
              <span className="flex items-center gap-2">
                <FlagRect country="GB" />
                {t("select.unitedKingdom")}
              </span>
            </SelectItem>
            <SelectItem value="ca">
              <span className="flex items-center gap-2">
                <FlagRect country="CA" />
                {t("select.canada")}
              </span>
            </SelectItem>
            <SelectItem value="au">
              <span className="flex items-center gap-2">
                <FlagRect country="AU" />
                {t("select.australia")}
              </span>
            </SelectItem>
            <SelectItem value="de">
              <span className="flex items-center gap-2">
                <FlagRect country="DE" />
                {t("select.germany")}
              </span>
            </SelectItem>
            <SelectItem value="fr">
              <span className="flex items-center gap-2">
                <FlagRect country="FR" />
                {t("select.france")}
              </span>
            </SelectItem>
            <SelectItem value="jp">
              <span className="flex items-center gap-2">
                <FlagRect country="JP" />
                {t("select.japan")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </DemoCard>
  );
}
