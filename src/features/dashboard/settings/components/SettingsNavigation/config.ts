import { HelpCircle, LogOut, LucideIcon } from "lucide-react";

interface FooterAction {
    id: string;
    icon: LucideIcon;
    labelKey: string;
    className: string;
}

export const NAV_CONFIG = {
    tabs: ["Profile", "Security", "Notifications", "Preferences"] as const,
};

export const FOOTER_ACTIONS: FooterAction[] = [
    {
        id: "help",
        icon: HelpCircle,
        labelKey: "helpSupport",
        className: "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]",
    },
    {
        id: "signout",
        icon: LogOut,
        labelKey: "signOut",
        className: "text-[var(--color-error)] hover:bg-[var(--color-error)]/10",
    },
];
