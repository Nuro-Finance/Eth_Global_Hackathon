export const DEMO_CREDENTIALS = {
    email: "demo@nuro.finance",
    password: "Nuro-Demo-2026$$$",
};

export function isDemoLoginEmail(email: string | undefined | null): boolean {
    if (!email) return false;
    return email.trim().toLowerCase() === DEMO_CREDENTIALS.email.toLowerCase();
}
