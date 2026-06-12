// Global user/auth types (used across multiple features)
export interface User {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role: 'admin' | 'user';
}

// Note: Component-specific types like Transaction, CreditCard, etc. 
// should be kept WITH their components for better portability
// when developers extract components for other projects
