"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { WidgetHeader } from "../../../../shared";
import { AvatarRow } from "./components/AvatarRow";
import { TransferDetails } from "./components/TransferDetails";
import { TransferButton } from "./components/TransferButton";

interface WalletData {
  id: string;
  name: string;
  address: string;
  network: string;
  symbol: string;
  type: string;
}

interface CardData {
  id: string;
  card_name?: string;
  last_four?: string;
  balance?: number;
  gradient?: string;
}

interface FastTransferSectionProps {
  t: (key: string) => string;
}

export function FastTransferSection({ t }: FastTransferSectionProps) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    if (!token) return;
    fetch("/api/wallets", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then(setWallets)
      .catch(() => {});
    fetch("/api/cards", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCards(Array.isArray(data) ? data : data.cards || []))
      .catch(() => {});
  }, [token]);

  const primaryCard = cards[0] || null;

  const handleTransfer = useCallback(async () => {
    if (!token || !selectedWallet || !amount || !primaryCard) return;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    setSending(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: primaryCard.id,
          toAddress: selectedWallet.address,
          toName: selectedWallet.name,
          amount: num,
          network: selectedWallet.network,
        }),
      });
      if (res.ok) {
        setStatus("success");
        setAmount("");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } finally {
      setSending(false);
    }
  }, [token, selectedWallet, amount, primaryCard]);

  return (
    <div className="hidden sm:block">
      <WidgetHeader
        title={t("Dashboard.fastTransfer") || "Fast transfer"}
        action={{
          type: "link",
          label: `+ ${t("Dashboard.addPeople") || "Add wallet"}`,
          onClick: () => window.location.href = "/en/dashboard/settings",
        }}
      />
      {wallets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-[var(--color-text-muted)] text-sm">P2P transfers coming soon</p>
          <p className="text-[var(--color-text-muted)] text-xs mt-1 opacity-60">Add wallets in Settings to enable fast transfers</p>
        </div>
      ) : (
        <>
          <AvatarRow wallets={wallets} selectedWallet={selectedWallet} onSelect={setSelectedWallet} />
          <TransferDetails
            t={t}
            card={primaryCard}
            selectedWallet={selectedWallet}
            amount={amount}
            onAmountChange={setAmount}
          />
          <TransferButton t={t} onTransfer={handleTransfer} sending={sending} status={status} disabled={!selectedWallet || !amount || !primaryCard} />
        </>
      )}
    </div>
  );
}
