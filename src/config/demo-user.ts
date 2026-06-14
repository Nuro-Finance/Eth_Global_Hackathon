/** Design-mode / demo identity — single source for mock session and sample data. */
export const DEMO_USER_FULL_NAME = "Demo User";
export const DEMO_USER_SHORT_NAME = "DU";
export const DEMO_USER_EMAIL = "demo@nuro.finance";
export const DEMO_USER_ID = "demo-user";

export function isDemoDevSession(
  user: { email?: string | null; id?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.email?.trim().toLowerCase() === DEMO_USER_EMAIL.toLowerCase()) return true;
  const id = user.id?.trim();
  return id === DEMO_USER_ID || id === "design-demo-user";
}

export function demoUserInitials(name: string = DEMO_USER_FULL_NAME): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
