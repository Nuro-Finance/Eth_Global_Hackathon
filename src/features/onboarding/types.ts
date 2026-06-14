export type AccountType = "personal" | "business";

export type OnboardingTheme = "light" | "dark";

export type AccountOnboardingStep =
  | "accountType"
  | "welcome"
  | "team"
  | "ens"
  | "wallet"
  | "theme"
  | "complete";

export type AccountOnboardingDraft = {
  accountType: AccountType | null;
  displayName: string;
  teamName: string;
  ensSlug: string;
  country?: string;
};
