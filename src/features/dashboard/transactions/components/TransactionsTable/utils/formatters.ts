/**
 * Format date string to a readable format
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
    });
}

/**
 * Format amount with sign based on transaction direction
 */
export function formatAmountString(
    amount: number,
    isIncoming: boolean
): string {
    const sign = isIncoming ? "+" : "-";
    return `${sign}$${amount.toFixed(2)}`;
}
