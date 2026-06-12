"use client";

import { useState } from "react";
import { UpgradeModal } from "@/features/dashboard/settings/components/SubscriptionContent/components/UpgradeModal";
import { NuroCometCtaButton } from "./NuroCometCtaButton";

export function HeroKycFinishButton() {
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  return (
    <>
      <UpgradeModal
        open={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
      />

      <NuroCometCtaButton onClick={() => setIsUpgradeModalOpen(true)}>
        Upgrade to Nuro+
      </NuroCometCtaButton>
    </>
  );
}
