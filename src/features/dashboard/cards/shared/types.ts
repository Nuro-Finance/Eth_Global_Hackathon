/**
 * Card type definition
 * Shared across all card-related components
 */
export interface Card {
    id: string;
    cardNumber: string;
    cardHolder: string;
    expiryDate: string;
    cardType: string;
    gradient: string;
    cardColor?: string;
    cardName: string;
    balance: number;
    isActive: boolean;
    isLocked: boolean;
    dailyLimit?: number;
 /** Only when returned by issuer / mock — never log or persist */
    cvv?: string | null;
}
