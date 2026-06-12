// Card stack data and animation configuration

export interface CardData {
    id: string;
    cardNumber: string;
    cardHolder: string;
    expiryDate: string;
    gradient: string;
    isGlass?: boolean;
    isAgency?: boolean;
}

// Sample cards data
export const initialCardsData: CardData[] = [
    {
        id: "vira",
        cardNumber: "3455 4562 7710 3507",
        cardHolder: "Alexander Munoz",
        expiryDate: "02/30",
        gradient:
            "linear-gradient(135deg, #1a1a1a 0%, #333333 100%)",
        isGlass: false,
        isAgency: false,
    },
    {
        id: "masteecard",
        cardNumber: "5412 7534 8912 3456",
        cardHolder: "John Carter",
        expiryDate: "05/31",
        gradient: "linear-gradient(135deg, #151313 0%, #6a6a6a 30%, #0f0f0f 100%)",
        isGlass: false,
        isAgency: false,
    },
];

// Demo card templates for generating new cards
const demoCardTemplates = [
    {
        gradient: "linear-gradient(135deg, #1a237e 0%, #3949ab 50%, #1a237e 100%)",
        id: "amex",
    },
    {
        gradient: "linear-gradient(135deg, #004d40 0%, #00897b 50%, #004d40 100%)",
        id: "discover",
    },
    {
        gradient: "linear-gradient(135deg, #b71c1c 0%, #e53935 50%, #b71c1c 100%)",
        id: "jcb",
    },
    {
        gradient: "linear-gradient(135deg, #4a148c 0%, #7b1fa2 50%, #4a148c 100%)",
        id: "diners",
    },
    {
        gradient: "linear-gradient(135deg, #e65100 0%, #ff9800 50%, #e65100 100%)",
        id: "unionpay",
    },
];

const demoNames = ["Emma Wilson", "James Smith", "Sofia Garcia", "Liam Johnson", "Olivia Brown"];

// Generate random card number
const generateCardNumber = (): string => {
    const groups = Array.from({ length: 4 }, () =>
        Math.floor(1000 + Math.random() * 9000).toString()
    );
    return groups.join(" ");
};

// Generate random expiry date (future date)
const generateExpiryDate = (): string => {
    const month = Math.floor(1 + Math.random() * 12).toString().padStart(2, "0");
    const year = (26 + Math.floor(Math.random() * 5)).toString();
    return `${month}/${year}`;
};

// Generate a new demo card
let cardCounter = 0;
export const generateDemoCard = (existingCount: number): CardData => {
    const templateIndex = existingCount % demoCardTemplates.length;
    const template = demoCardTemplates[templateIndex];
    const nameIndex = existingCount % demoNames.length;
    cardCounter++;

    return {
        id: `${template.id}-${cardCounter}`,
        cardNumber: generateCardNumber(),
        cardHolder: demoNames[nameIndex],
        expiryDate: generateExpiryDate(),
        gradient: template.gradient,
        isGlass: false,
    };
};

// Animation timing
export const animationConfig = {
    swapDelay: 400,
    resetDelay: 500,
};
