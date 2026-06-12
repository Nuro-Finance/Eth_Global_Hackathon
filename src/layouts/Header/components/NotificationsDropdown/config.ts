import type { NotificationType } from "./types";

/**
 * Get background color class based on notification type
 */
export function getTypeColor(type: NotificationType): string {
    const colors: Record<NotificationType, string> = {
        success: "bg-[var(--color-success)]",
        warning: "bg-yellow-500",
        error: "bg-[var(--color-error)]",
        info: "bg-blue-500",
    };
    return colors[type] || colors.info;
}
