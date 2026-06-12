"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Shield, CreditCard, Download, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Card } from "../../../shared";

interface CardQuickActionsProps {
  card: Card;
}

export function CardQuickActions({ card }: CardQuickActionsProps) {
  const t = useTranslations("Cards");
  const { data: session } = useSession();
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSetDefault = async () => {
    if (!session?.accessToken) return;
    setLoading("default");
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error("Failed to set default");
      setSuccess("default");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("[setDefault]", err);
    } finally { setLoading(null); }
  };

  const handleRequestNewCard = () => {
    setSuccess("newCard");
    setTimeout(() => setSuccess(null), 4000);
  };

  return (
    <div className="mt-6 pt-6 border-t border-[var(--color-border-primary)]/30">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-[var(--color-text-muted)]" />
        <h4 className="text-[var(--color-text-secondary)] text-[14px] sm:text-[16px] font-normal">
          {t("quickActions")}
        </h4>
      </div>
      <div className="space-y-3">
        <Button variant="outline" size="sm" className="w-full flex items-center justify-center gap-2" onClick={handleSetDefault} disabled={loading === "default"}>
          <Shield className="w-4 h-4" />
          <span className="text-[13px] sm:text-[14px]">
            {loading === "default" ? "Setting..." : success === "default" ? "Done!" : t("setAsDefault")}
          </span>
        </Button>
        <Button variant="outline" size="sm" className="w-full flex items-center justify-center gap-2" onClick={() => window.location.href = "/dashboard/settings"}>
          <CreditCard className="w-4 h-4" />
          <span className="text-[13px] sm:text-[14px]">{t("updateBillingAddress")}</span>
        </Button>
        <Button variant="outline" size="sm" className="w-full flex items-center justify-center gap-2" onClick={handleRequestNewCard} disabled={loading === "newCard"}>
          <Download className="w-4 h-4" />
          <span className="text-[13px] sm:text-[14px]">
            {loading === "newCard" ? "Requesting..." : success === "newCard" ? "Coming Soon — One Card Per Account" : t("requestNewCard")}
          </span>
        </Button>
      </div>
    </div>
  );
}
