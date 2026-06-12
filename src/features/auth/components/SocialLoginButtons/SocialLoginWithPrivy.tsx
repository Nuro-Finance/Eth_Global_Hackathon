"use client";

import { usePrivy } from "@privy-io/react-auth";
import SocialLoginButtons from "./index";

interface SocialLoginWithPrivyProps {
  variant?: "stacked" | "inline";
}

/**
 * Renders Google / Telegram buttons that open Privy with the chosen login method.
 * Must be used under {@link PrivyProvider} (when NEXT_PUBLIC_PRIVY_APP_ID is set).
 */
export default function SocialLoginWithPrivy({
  variant,
}: SocialLoginWithPrivyProps) {
  const { login, ready } = usePrivy();

  return (
    <SocialLoginButtons
      variant={variant}
      onGoogleLogin={() => {
        if (!ready) return;
        login({ loginMethods: ["google"] });
      }}
      onTelegramLogin={() => {
        if (!ready) return;
        login({ loginMethods: ["telegram"] });
      }}
    />
  );
}
