"use client";

import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useAppSession } from "@/hooks/useAppSession";
import { RootState } from "@/store/store";
import { useTranslations } from "next-intl";
import { DEMO_USER_FULL_NAME, DEMO_USER_SHORT_NAME } from "@/config/demo-user";
import {
  DEFAULT_GREETING_EMOJI,
  readGreetingEmoji,
  writeGreetingEmoji,
} from "@/lib/greetingEmoji";
import { GreetingEmojiPicker } from "./GreetingEmojiPicker";

export function Greeting() {
  const { user } = useSelector((state: RootState) => state.auth);
  const { data: session } = useAppSession();
  const t = useTranslations();
  const [greeting, setGreeting] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_GREETING_EMOJI);

  const userId =
    user?.id || (session?.user as { id?: string } | undefined)?.id || "guest";

  useEffect(() => {
    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return t("Dashboard.goodMorning") || "Good morning";
      if (hour < 18) return t("Dashboard.goodAfternoon") || "Good afternoon";
      return t("Dashboard.goodEvening") || "Good evening";
    };

    setGreeting(getGreeting());
  }, [t]);

  useEffect(() => {
    setEmoji(readGreetingEmoji(userId));
  }, [userId]);

  const fullName = (session?.user as any)?.name
    || (user?.name && !user.name.startsWith("Nuro User") ? user.name : null);
  const firstName =
    fullName === DEMO_USER_FULL_NAME ? DEMO_USER_SHORT_NAME : fullName?.split(" ")[0] || "User";

  const handleEmojiSelect = (next: string) => {
    setEmoji(next);
    writeGreetingEmoji(userId, next);
  };

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[var(--color-text-primary)] text-[18px] sm:text-[20px] md:text-[24px] font-normal leading-tight">
        {greeting}, {firstName}! <GreetingEmojiPicker emoji={emoji} onSelect={handleEmojiSelect} />
      </h2>
      <p className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] md:text-[14px] leading-tight mt-0.5">
        {t("Dashboard.welcomeBack") ||
          "Welcome back to Nuro, your agent neobank."}
      </p>
    </div>
  );
}

export default Greeting;
