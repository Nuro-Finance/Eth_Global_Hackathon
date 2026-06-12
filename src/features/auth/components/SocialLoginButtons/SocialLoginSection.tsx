"use client";

import SocialLoginButtons from "./index";
import SocialLoginWithPrivy from "./SocialLoginWithPrivy";

const privyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

interface SocialLoginSectionProps {
  variant?: "stacked" | "inline";
}

/**
 * Uses Privy-backed handlers when the app ID is configured; otherwise no-op stubs
 * so the login page still renders without {@link PrivyProvider}.
 */
export default function SocialLoginSection({ variant }: SocialLoginSectionProps) {
  if (privyConfigured) {
    return <SocialLoginWithPrivy variant={variant} />;
  }

  return (
    <SocialLoginButtons
      variant={variant}
      onGoogleLogin={() => {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[Privy] Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local to enable social login.",
          );
        }
      }}
      onTelegramLogin={() => {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[Privy] Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local to enable social login.",
          );
        }
      }}
    />
  );
}
