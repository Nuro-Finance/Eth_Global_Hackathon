"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, Bot, CreditCard, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginBackground } from "@/features/auth/layouts/LoginLayout/components";
import { useAppSession } from "@/hooks/useAppSession";
import {
  getWelcomeUserId,
  markWelcomeSeenClient,
  welcomeSeenForUserClient,
} from "@/lib/welcome-onboarding";

/** Interim onboarding - shown once per user until real onboarding ships. */
export default function WelcomePage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session, status } = useAppSession();

  const userId = getWelcomeUserId(session?.user);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (userId && welcomeSeenForUserClient(userId)) {
      router.replace("/dashboard");
    }
  }, [status, userId, router]);

  const enterDashboard = () => {
    if (userId) markWelcomeSeenClient(userId);
    router.replace("/dashboard");
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center px-4 relative overflow-hidden">
      <LoginBackground />
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="mb-12">
          <h1 className="flex justify-center mb-6">
            <img
              src="/Nuro Horizontal Logo.svg"
              alt="Nuro Finance"
              className="h-10 md:h-14 w-auto px-4"
            />
          </h1>
          <p className="text-xl md:text-2xl text-[var(--color-text-muted)] mb-8 max-w-2xl mx-auto">
            {t("Hero.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner border-0 rounded-[28px] p-6 transition-transform duration-200 hover:-translate-y-[3px]">
            <Bot className="w-8 h-8 text-[var(--color-primary)] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              {t("Hero.analytics")}
            </h3>
            <p className="text-[var(--color-text-muted)] whitespace-pre-line">
              {t("Hero.analyticsDesc")}
            </p>
          </div>

          <div className="bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner border-0 rounded-[28px] p-6 transition-transform duration-200 hover:-translate-y-[3px]">
            <CreditCard className="w-8 h-8 text-[var(--color-primary)] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              {t("Hero.cardManagement")}
            </h3>
            <p className="text-[var(--color-text-muted)]">
              {t("Hero.cardManagementDesc")}
            </p>
          </div>

          <div className="bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner border-0 rounded-[28px] p-6 transition-transform duration-200 hover:-translate-y-[3px]">
            <TrendingUp className="w-8 h-8 text-[var(--color-primary)] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              {t("Hero.tracking")}
            </h3>
            <p className="text-[var(--color-text-muted)] whitespace-pre-line">
              {t("Hero.trackingDesc")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="default"
          size="lg"
          onClick={enterDashboard}
          className="inline-flex items-center gap-2 px-10 h-[56px] text-lg rounded-[var(--radius-md)] min-w-[240px] text-white [&_svg]:text-white transition-transform duration-200 hover:-translate-y-[3px]"
        >
          Quick Start
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
