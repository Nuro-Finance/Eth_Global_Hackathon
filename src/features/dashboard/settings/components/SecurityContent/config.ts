import { Shield, Key, History, LucideIcon } from "lucide-react";

export interface SecurityRowConfig {
    id: string;
    icon: LucideIcon;
    titleKey: string;
    descriptionKey: string;
    actionType: "toggle" | "button";
    actionLabelKey?: string;
    stateKey?: string;
}

export const SECURITY_ROWS: SecurityRowConfig[] = [
    {
        id: "changePassword",
        icon: Key,
        titleKey: "changePassword",
        descriptionKey: "changePasswordDesc",
        actionType: "button",
        actionLabelKey: "change",
    },
    {
        id: "twoFactor",
        icon: Shield,
        titleKey: "twoFactorAuth",
        descriptionKey: "twoFactorAuthDesc",
        actionType: "toggle",
        stateKey: "twoFactorEnabled",
    },
    {
        id: "loginHistory",
        icon: History,
        titleKey: "loginHistory",
        descriptionKey: "loginHistoryDesc",
        actionType: "button",
        actionLabelKey: "view",
    },
    {
        id: "activeSessions",
        icon: Shield,
        titleKey: "activeSessions",
        descriptionKey: "activeSessionsDesc",
        actionType: "button",
        actionLabelKey: "manage",
    },
];

export const SECURITY_SECTION = {
    titleKey: "accountSecurity",
    descriptionKey: "accountSecurityDesc",
    icon: Shield,
};
