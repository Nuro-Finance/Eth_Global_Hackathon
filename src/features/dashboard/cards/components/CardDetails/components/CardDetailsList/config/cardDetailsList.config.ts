/**
 * CardDetailsList Configuration
 * Table cell styling configuration
 */

export const TABLE_CELL_STYLES = {
    label:
        "text-[var(--color-text-muted)] text-[11px] sm:text-[12px] font-normal py-3 ps-3",
    value:
        "text-[var(--color-text-secondary)] text-[12px] sm:text-[13px] font-normal py-3 pe-3 text-end",
    valueTruncate:
        "text-[var(--color-text-secondary)] text-[12px] sm:text-[13px] font-normal py-3 pe-3 text-end truncate max-w-[150px]",
    badgeCell: "py-3 pe-3 text-end",
    lastRowLabel:
        "text-[var(--color-text-muted)] text-[11px] sm:text-[12px] font-normal py-3 ps-3 border-b border-[var(--color-border-primary)]",
    lastRowValue: "py-3 pe-3 text-end border-b border-[var(--color-border-primary)]",
};

/**
 * Default card shape - used for type reference only.
 * Real data comes from /api/cards.
 */
export const MOCK_CARD_DATA = {
    id: "",
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cardType: "VISA",
    gradient: "",
    balance: 0,
    isActive: true,
    isLocked: false,
};
