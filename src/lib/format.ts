/**
 * Shared formatting helpers used across the app.
 *
 * USD formatting uses en-US locale with thousands separators and exactly 2
 * decimals — the finance/accounting standard. Replaces ad-hoc `$${x.toFixed(2)}`
 * which produces ugly "$2000000006.84" instead of "$2,000,000,006.84".
 */

/**
 * Format a number as USD with thousands separators and 2 decimals.
 * Example: 2000000006.84 → "$2,000,000,006.84"
 */
export function formatUSD(amount: number): string {
    if (!Number.isFinite(amount)) return "$0.00";
    return `$${amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Format USD with a leading sign.
 * Example: (153.5, true) → "+$153.50"
 *          (153.5, false) → "-$153.50"
 */
export function formatSignedUSD(amount: number, isIncoming: boolean): string {
    return `${isIncoming ? "+" : "-"}${formatUSD(amount)}`;
}
