import { LucideIcon } from "lucide-react";

/**
 * Setting row item configuration
 */
export interface SettingRowItem {
    id: string;
    icon: LucideIcon;
    titleKey: string;
    descriptionKey: string;
    actionType: "toggle" | "button" | "select";
    actionProps?: {
        buttonLabelKey?: string;
        selectOptions?: { value: string; label: string }[];
        onClick?: () => void;
    };
}

/**
 * Settings section configuration
 */
export interface SettingsSectionConfig {
    id: string;
    titleKey: string;
    description: string;
    icon: LucideIcon;
    rows: SettingRowItem[];
}
