export const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export interface TransferUser {
    id: string;
    name: string;
    avatar: string;
    coordinates: [number, number];
    amount: number;
    type: "sent" | "received";
    currency: string;
    time: string;
    country: string;
}

// Sample transfer data
export const transfersData: TransferUser[] = [
    {
        id: "1",
        name: "Sarah Chen",
        avatar: "/assets/images/avatar/person/person-female.png",
        coordinates: [121.5654, 25.033],
        amount: 2500,
        type: "received",
        currency: "USD",
        time: "2 min ago",
        country: "Taiwan",
    },
    {
        id: "2",
        name: "James Wilson",
        avatar: "/assets/images/avatar/person/person.png",
        coordinates: [-74.006, 40.7128],
        amount: 1200,
        type: "sent",
        currency: "USD",
        time: "15 min ago",
        country: "United States",
    },
    {
        id: "3",
        name: "Maria Garcia",
        avatar: "/assets/images/avatar/person/person-female-2.png",
        coordinates: [-3.7038, 40.4168],
        amount: 3400,
        type: "received",
        currency: "USD",
        time: "1 hour ago",
        country: "Spain",
    },
    {
        id: "4",
        name: "Ahmed Hassan",
        avatar: "/assets/images/avatar/person/person-2.png",
        coordinates: [31.2357, 30.0444],
        amount: 890,
        type: "sent",
        currency: "USD",
        time: "3 hours ago",
        country: "Egypt",
    },
    {
        id: "5",
        name: "Yuki Tanaka",
        avatar: "/assets/images/avatar/person/person-female.png",
        coordinates: [139.6917, 35.6895],
        amount: 5600,
        type: "received",
        currency: "JPY",
        time: "5 hours ago",
        country: "Japan",
    },
    {
        id: "6",
        name: "Lucas Silva",
        avatar: "/assets/images/avatar/person/person.png",
        coordinates: [-46.6333, -23.5505],
        amount: 1800,
        type: "sent",
        currency: "BRL",
        time: "8 hours ago",
        country: "Brazil",
    },
];

// Map configuration
export const mapConfig = {
    projection: {
        scale: 147,
        center: [0, 20] as [number, number],
    },
    dimensions: {
        width: 800,
        height: 400,
    },
    zoom: {
        min: 1,
        max: 8,
        initial: 3,
 /**
 * translateExtent defines the panning boundaries of the map.
 * It limits how far users can drag/pan the map in any direction.
 * Format: [[minX, minY], [maxX, maxY]]
 * - First pair: Top-left corner boundary (can't pan beyond this)
 * - Second pair: Bottom-right corner boundary (can't pan beyond this)
 * This prevents users from panning into empty space and keeps the map focused.
 */
        translateExtent: [
            [-200, -200],
            [1000, 600],
        ] as [[number, number], [number, number]],
    },
};
