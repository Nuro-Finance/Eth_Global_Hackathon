export const CURRENCY_OPTIONS = [
    { value: "USD", label: "USD - US Dollar" },
    { value: "GBP", label: "GBP - British Pound" },
    { value: "JPY", label: "JPY - Japanese Yen" },
] as const;

export const DEFAULT_VALUES = {
    transferDate: new Date(),
};
