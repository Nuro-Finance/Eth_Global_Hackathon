import { Settings, Globe, Moon, LucideIcon } from "lucide-react";

export interface SelectOption {
    value: string;
    label: string;
}

export interface PreferenceRowConfig {
    id: string;
    icon: LucideIcon;
    titleKey: string;
    descriptionKey: string;
    actionType: "toggle" | "button" | "select";
    stateKey?: string;
    selectKey?: string;
    selectOptions?: SelectOption[];
    actionLabelKey?: string;
}

export interface PreferenceSectionConfig {
    id: string;
    titleKey: string;
    descriptionKey: string;
    icon: LucideIcon;
    rows: PreferenceRowConfig[];
}

export const LANGUAGE_OPTIONS: SelectOption[] = [
    { value: "en", label: "English" },
    { value: "ar", label: "العربية" },
    { value: "fr", label: "Français" },
    { value: "es", label: "Español" },
];

export const CURRENCY_OPTIONS: SelectOption[] = [
    { value: "USD", label: "USD" },
    { value: "GBP", label: "GBP" },
    { value: "JPY", label: "JPY" },
];

export const PREFERENCES_SECTIONS: PreferenceSectionConfig[] = [
    {
        id: "languageRegion",
        titleKey: "languageRegion",
        descriptionKey: "languageRegionDesc",
        icon: Globe,
        rows: [
            {
                id: "language",
                icon: Globe,
                titleKey: "language",
                descriptionKey: "languageDesc",
                actionType: "select",
                selectKey: "language",
                selectOptions: LANGUAGE_OPTIONS,
            },
            {
                id: "currency",
                icon: Globe,
                titleKey: "currency",
                descriptionKey: "currencyDesc",
                actionType: "select",
                selectKey: "currency",
                selectOptions: CURRENCY_OPTIONS,
            },
        ],
    },
    {
        id: "displayPreferences",
        titleKey: "displayPreferences",
        descriptionKey: "displayPreferencesDesc",
        icon: Settings,
        rows: [
            {
                id: "darkMode",
                icon: Moon,
                titleKey: "darkMode",
                descriptionKey: "darkModeDesc",
                actionType: "toggle",
                stateKey: "darkMode",
            },
        ],
    },
];
