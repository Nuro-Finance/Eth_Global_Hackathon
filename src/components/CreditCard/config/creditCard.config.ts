// Credit card styling and configuration

export interface CardGradient {
    id: string;
    gradient: string;
    isGlass?: boolean;
}

// Box shadow styles for credit card hover states
export const cardShadows = {
    default:
        "0 20px 35px -10px var(--color-card-shadow-default), 0 8px 15px -5px var(--color-shadow-primary)",
    hovered:
        "0 25px 50px -12px var(--color-card-shadow-hover), 0 10px 20px -5px var(--color-shadow-primary)",
};

// Card dimensions
export const cardDimensions = {
    width: 280,
    height: 180,
    borderRadius: 16,
};
