"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Car,
  Train,
  Plane,
  Fuel,
  Dumbbell,
  ShoppingBag,
  Utensils,
  Music,
  TrendingUp,
  ArrowRightLeft,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

const API_URL = ""; // Use Next.js proxy routes (relative URLs)

const CATEGORY_ICON: Record<string, LucideIcon> = {
  income:        TrendingUp,
  transfer:      ArrowRightLeft,
  entertainment: Music,
  shopping:      ShoppingBag,
  food:          Utensils,
  transport:     Car,
  travel:        Plane,
  health:        Dumbbell,
  fuel:          Fuel,
  train:         Train,
};

export interface RecentTransaction {
  id:       string;
  name:     string;
  date:     string;
  amount:   number;
  icon:     LucideIcon;
  category: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso)
      .toLocaleString("en-GB", {
        day:    "2-digit",
        month:  "short",
        year:   "numeric",
        hour:   "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", "");
  } catch {
    return iso;
  }
}

export function useRecentTransactions(cardId?: string) {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [isLoading, setIsLoading]       = useState(false);

  useEffect(() => {
    if (!session?.accessToken || !cardId) return;
    setIsLoading(true);
 // /card-transactions supports cardIds filtering; /transactions is for bridge history
    fetch(`/api/transactions?cardIds=${cardId}&pageSize=5`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: any[]) => {
        setTransactions(
          data.map((tx) => ({
            id:       tx.id,
            name:     tx.name,
            date:     formatDate(tx.date),
            amount:   tx.isIncoming ? tx.amount : -tx.amount,
            icon:     CATEGORY_ICON[tx.category?.toLowerCase()] ?? CreditCard,
            category: tx.category,
          }))
        );
      })
      .catch((err) => {
        console.error("[useRecentTransactions]", err);
        setTransactions([]);
      })
      .finally(() => setIsLoading(false));
  }, [session?.accessToken, cardId]);

  return { transactions, isLoading };
}
