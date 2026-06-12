/** Design-mode / demo identity — single source for mock session and sample data. */
export const DEMO_USER_FULL_NAME = "Demo User";
export const DEMO_USER_SHORT_NAME = "DU";
export const DEMO_USER_EMAIL = "demo@nuro.finance";
export const DEMO_USER_ID = "demo-user";

export function demoUserInitials(name: string = DEMO_USER_FULL_NAME): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
