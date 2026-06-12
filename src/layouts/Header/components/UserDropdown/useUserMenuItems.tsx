"use client";

import { useTranslations } from "next-intl";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/store/store";
import { logoutUser } from "@/store/slices/authSlice";
import { User, Shield, Wallet, CreditCard, Crown, LogOut } from "lucide-react";
import { LanguageSelector } from "../LanguageSelector";
import { useRouter } from "@/i18n/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import { DESIGN_MODE } from "@/config/design-mode";

/**
 * Shared hook for profile/settings menu items (used by Sidebar profile and legacy UserDropdown)
 */
export function useUserMenuItems() {
  const t = useTranslations("Header");
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { privyEnabled } = usePrivyRuntime();
  const isDesignMode = DESIGN_MODE;

  // ===== DESIGN MODE BYPASS: INSTANT RETURN =====
  if (isDesignMode) {
    const handleMockLogout = async () => {
      await dispatch(logoutUser());
      router.push("/login");
    };
    
    return {
      userMenuItems: [
        {
          id: "profile",
          label: t("profile") || "Profile",
          icon: <User className="w-4 h-4" strokeWidth={1.5} />,
          href: "/dashboard/settings",
        },
        {
          id: "security",
          label: "Security",
          icon: <Shield className="w-4 h-4" strokeWidth={1.5} />,
          href: "/dashboard/settings/security",
        },
        {
          id: "cards",
          label: "Cards",
          icon: <CreditCard className="w-4 h-4" strokeWidth={1.5} />,
          href: "/dashboard/cards",
        },
        {
          id: "subscription",
          label: "Subscription",
          icon: <Crown className="w-4 h-4" strokeWidth={1.5} />,
          href: "/dashboard/settings/subscription",
        },
        {
          id: "logout",
          label: t("logout") || "Log out",
          icon: <LogOut className="w-4 h-4" strokeWidth={1.5} />,
          onClick: handleMockLogout,
          variant: "danger" as const,
        },
      ]
    };
  }

  const { logout } = usePrivy();

  const handleLogout = async () => {
    // 1. Log out from Privy if enabled
    if (privyEnabled) {
      try {
        await logout();
      } catch (e) {
        console.error("[useUserMenuItems] Privy logout failed", e);
      }
    }

    // 2. Clear local Redux/Storage session
    await dispatch(logoutUser());
    router.push("/login");
  };

  const userMenuItems = [
    {
      id: "profile",
      label: t("profile") || "Profile",
      icon: <User className="w-4 h-4" strokeWidth={1.5} />,
      href: "/dashboard/settings",
    },
    {
      id: "security",
      label: "Security",
      icon: <Shield className="w-4 h-4" strokeWidth={1.5} />,
      href: "/dashboard/settings/security",
    },
    {
      id: "cards",
      label: "Cards",
      icon: <CreditCard className="w-4 h-4" strokeWidth={1.5} />,
      href: "/dashboard/cards",
    },
    {
      id: "subscription",
      label: "Subscription",
      icon: <Crown className="w-4 h-4" strokeWidth={1.5} />,
      href: "/dashboard/settings/subscription",
    },
    {
      id: "language",
      content: (
        <div className="w-full lg:hidden pt-2 mt-2 border-t border-[var(--color-border-primary)]/60">
          <LanguageSelector variant="list" />
        </div>
      ),
      preventClose: true,
      className: "lg:hidden cursor-default px-0",
    },
    {
      id: "logout",
      label: t("logout") || "Log out",
      icon: <LogOut className="w-4 h-4" strokeWidth={1.5} />,
      onClick: handleLogout,
      variant: "danger" as const,
    },
  ];

  return { userMenuItems };
}
