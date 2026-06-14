"use client";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useTranslations } from "next-intl";
import { resolveDisplayFirstName } from "@/lib/displayName";
import { useSessionDisplayIdentity } from "@/hooks/useSessionDisplayIdentity";

export default function Greeting() {
  const { user } = useSelector((state: RootState) => state.auth);
  const identity = useSessionDisplayIdentity();
  const t = useTranslations();
  const [greeting, setGreeting] = useState("");

 // Get greeting based on time of day (client-side only to avoid hydration issues)
  useEffect(() => {
    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return t("Dashboard.goodMorning") || "Good morning";
      if (hour < 18) return t("Dashboard.goodAfternoon") || "Good afternoon";
      return t("Dashboard.goodEvening") || "Good evening";
    };
    setGreeting(getGreeting());
  }, [t]);

 // Prefer NextAuth session name, fall back to Redux - extract first name
  const displayName = resolveDisplayFirstName({
    name: identity.name,
    email: identity.email,
  });

  return (
    <div>
      <h2 className="text-[var(--color-text-primary)] text-[18px] sm:text-[20px] md:text-[24px] font-normal">
        {greeting}, {displayName}! 👋
      </h2>
      <p className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] md:text-[14px] mt-1">
        {t("Dashboard.welcomeBack") ||
          "Welcome back to Nuro, your agent neobank."}
      </p>
    </div>
  );
}
