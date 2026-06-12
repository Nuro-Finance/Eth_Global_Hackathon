/** Design-mode / demo identity — single source for mock session and sample data. */
export const DEMO_USER_FULL_NAME = "Chris Brignola";
export const DEMO_USER_SHORT_NAME = "CB";
export const DEMO_USER_EMAIL = "chris.brignola@nuro.finance";
export const DEMO_USER_ID = "chris-brignola";

export function demoUserInitials(name: string = DEMO_USER_FULL_NAME): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
