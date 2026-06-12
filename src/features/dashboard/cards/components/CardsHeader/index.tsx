"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface CardsHeaderProps {
  onAddCard: () => void;
}

/**
 * CardsHeader - Header component with add card action
 */
export default function CardsHeader({ onAddCard }: CardsHeaderProps) {
  const t = useTranslations("Cards");

  return (
    <div className="flex items-center justify-end mb-6">
      <Button variant="default" size="default" onClick={onAddCard}>
        <Plus className="w-4 h-4 mr-2" />
        {t("addNewCard")}
      </Button>
    </div>
  );
}

export { CardsHeader };
