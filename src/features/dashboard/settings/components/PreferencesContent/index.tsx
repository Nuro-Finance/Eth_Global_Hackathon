"use client";

import { useTranslations } from "next-intl";
import SettingRow from "../SettingRow";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import SettingsSection from "@/components/settings-section";
import { LanguageSelector } from "@/components/LanguageSelector";
import { SettingsGlassPicker } from "@/features/dashboard/settings/components/SettingsGlassPicker";
import { SETTINGS_SELECT_TRIGGER_CLASS } from "@/features/dashboard/settings/settingsStyles";
import { useDispatch, useSelector } from "react-redux";
import { setCurrency as setGlobalCurrency } from "@/store/slices/dashboardSlice";
import { RootState } from "@/store/store";
import {
  usePreferencesState,
  type PreferencesState,
  type SelectState,
} from "./hooks";
import { PREFERENCES_SECTIONS, type PreferenceRowConfig } from "./config";

export default function PreferencesContent() {
  const t = useTranslations("Settings");
  const { preferences, selects, togglePreference, setSelectValue } =
    usePreferencesState();
  const dispatch = useDispatch();
  const globalCurrency = useSelector(
    (state: RootState) => state.dashboard.currency
  );

  const renderAction = (row: PreferenceRowConfig) => {
    switch (row.actionType) {
      case "toggle":
        if (row.id === "darkMode") {
          return (
            <Switch
              checked
              onChange={() => {}}
              aria-label={t("darkMode")}
            />
          );
        }
        if (row.stateKey) {
          const stateKey = row.stateKey as keyof PreferencesState;
          return (
            <Switch
              checked={preferences[stateKey]}
              onChange={() => togglePreference(stateKey)}
            />
          );
        }
        return null;

      case "select":
        if (row.id === "language") {
          return (
            <LanguageSelector
              variant="settings"
              showChevron
              triggerClassName={SETTINGS_SELECT_TRIGGER_CLASS}
            />
          );
        }
        if (row.selectKey && row.selectOptions) {
          const selectKey = row.selectKey as keyof SelectState;
          const isCurrency = row.id === "currency";
          const currentValue = isCurrency ? globalCurrency : selects[selectKey];

          return (
            <SettingsGlassPicker
              value={currentValue}
              onValueChange={(value) => {
                setSelectValue(selectKey, value);
                if (isCurrency) {
                  dispatch(setGlobalCurrency(value as "USD" | "GBP" | "JPY"));
                }
              }}
              options={row.selectOptions}
              ariaLabel={isCurrency ? "Select currency" : "Select option"}
            />
          );
        }
        return null;

      case "button":
        return (
          <Button variant="outline" size="sm" className="rounded-[10px]">
            {t(row.actionLabelKey!)}
          </Button>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {PREFERENCES_SECTIONS.map((section) => {
        const SectionIcon = section.icon;
        return (
          <SettingsSection
            key={section.id}
            title={t(section.titleKey)}
            description={t(section.descriptionKey)}
            icon={<SectionIcon className="h-5 w-5" />}
          >
            {section.rows.map((row) => (
              <SettingRow
                key={row.id}
                title={t(row.titleKey)}
                description={t(row.descriptionKey)}
                action={renderAction(row)}
              />
            ))}
          </SettingsSection>
        );
      })}
    </div>
  );
}
