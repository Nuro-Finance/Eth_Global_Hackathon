"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WidgetCard } from "../../shared";
import { StockSection } from "./components/StockSection";
import { FastTransferSection } from "./components/FastTransferSection";
import { usePolymarketData } from "./hooks/usePolymarketData";

/**
 * SmartInvestPanel — Live prediction markets from Polymarket + fast transfers
 */
export default function SmartInvestPanel() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState("Trending");
  const { trending, politics, crypto, isLoading } = usePolymarketData();

  const tabConfig = [
    { id: "Trending", label: "Trending" },
    { id: "Politics", label: "Politics" },
    { id: "Crypto", label: "Crypto" },
  ];

  const stocksByTab: Record<string, typeof trending> = {
    Trending: trending,
    Politics: politics,
    Crypto: crypto,
  };

  return (
    <WidgetCard
      title="Prediction Markets"
      action={{
        type: "link",
        label: "Polymarket",
        onClick: () => window.open("https://polymarket.com", "_blank"),
      }}
      className="overflow-hidden"
    >
      <StockSection
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabConfig}
        stocks={stocksByTab[activeTab] || trending}
        isLoading={isLoading}
      />

      <FastTransferSection t={t} />
    </WidgetCard>
  );
}
