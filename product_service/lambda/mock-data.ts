export type Products = 
    { 
        id: string, 
        title: string, 
        description: string, 
        price: number, 
        count: number 
    }[];

export const mockProducts: Products = [
    {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Laptop",
        description: "High-performance laptop with 16GB RAM",
        price: 999.99,
        count: 5
    },
    {
        id: "550e8400-e29b-41d4-a716-446655440001",
        title: "Wireless Mouse",
        description: "Ergonomic wireless mouse with precision tracking",
        price: 29.99,
        count: 25
    },
    {
        id: "550e8400-e29b-41d4-a716-446655440002",
        title: "USB-C Cable",
        description: "Fast charging USB-C cable, 2 meters",
        price: 12.99,
        count: 50
    },
    {
        id: "550e8400-e29b-41d4-a716-446655440003",
        title: "Mechanical Keyboard",
        description: "RGB mechanical keyboard with Cherry MX switches",
        price: 149.99,
        count: 12
    },
    {
        id: "550e8400-e29b-41d4-a716-446655440004",
        title: "4K Monitor",
        description: "27-inch 4K Ultra HD monitor with HDR support",
        price: 499.99,
        count: 8
    },
    {
        id: "550e8400-e29b-41d4-a716-446655440005",
        title: "Headphones",
        description: "Noise-cancelling wireless headphones with 30-hour battery",
        price: 199.99,
        count: 15
    },
    {
        id: "550e8400-e29b-41d4-a716-446655440006",
        title: "Webcam",
        description: "1080p HD webcam with built-in microphone",
        price: 59.99,
        count: 20
    },
    {
        id: "550e8400-e29b-41d4-a716-446655440007",
        title: "External SSD",
        description: "1TB portable SSD with fast transfer speeds",
        price: 149.99,
        count: 10
    }
];


