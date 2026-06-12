"use client";

import { useMyCardDataMode } from "@/features/dashboard/my-card-1/MyCardDataModeContext";
import { useMyCardFirstTimeCardActivated } from "@/features/dashboard/my-card-1/hooks/myCardDesignSampleData";
import { useAccountBalance } from "@/features/dashboard/overview/components/CardSection/AccountInfo/hooks/useAccountBalance";
import { useKycStartFlow } from "@/features/dashboard/overview/hooks/useKycStartFlow";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";

export function useMyCardFirstTimePrimaryCta(onReloadClick?: () => void) {
  const myCardMode = useMyCardDataMode();
  const isFirstTimeUser = myCardMode === "first-time-user";
  const { isDevAvailable } = useDevPreviewMode();
  const { balance } = useAccountBalance();
  const { cardActivated: previewActivated, activateCard } =
    useMyCardFirstTimeCardActivated();
  const { cardActivated: kycActivated, startKyc, starting: kycStarting } =
    useKycStartFlow();

  const cardActivated =
    isDevAvailable && isFirstTimeUser ? previewActivated : kycActivated;
  const awaitingFirstDeposit = cardActivated && balance <= 0;

  const label = !cardActivated
    ? "Activate My Card"
    : awaitingFirstDeposit
      ? "Deposit funds"
      : "Reload Card";

  const handleClick = () => {
    if (!isFirstTimeUser) return;
    if (awaitingFirstDeposit || (cardActivated && balance > 0)) {
      onReloadClick?.();
      return;
    }
    if (isDevAvailable) {
      activateCard();
      return;
    }
    void startKyc();
  };

  return {
    isFirstTimeUser,
    label,
    handleClick,
    disabled: !cardActivated && !isDevAvailable && kycStarting,
  };
}
