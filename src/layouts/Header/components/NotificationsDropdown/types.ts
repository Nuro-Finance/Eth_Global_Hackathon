export type NotificationType = "info" | "warning" | "success" | "error";

export interface Notification {
    id: string;
    title: string;
    message: string;
 /** Long-form time (e.g. for accessibility); UI uses `timeShort` when set */
    time: string;
 /** Compact top-line label, e.g. "2m", "1hr", "1d" */
    timeShort: string;
    isRead: boolean;
    type: NotificationType;
}
