import { DEMO_USER_FULL_NAME, DEMO_USER_SHORT_NAME } from "@/config/demo-user";

/** First name for greetings - never show demo placeholder for real accounts. */
export function resolveDisplayFirstName(input: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = input.name?.trim();
  if (name && name !== DEMO_USER_FULL_NAME && !name.startsWith("Nuro User")) {
    const first = name.split(/\s+/).filter(Boolean)[0];
    if (first) return first;
  }
  const localPart = input.email?.split("@")[0]?.trim();
  if (localPart) return localPart;
  return "User";
}

export function isDemoPlaceholderName(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  return !trimmed || trimmed === DEMO_USER_FULL_NAME || trimmed === DEMO_USER_SHORT_NAME;
}
