"use client";

import { useTranslations } from "next-intl";
import { Table, TableBody } from "@/components/ui/table";
import type { Card } from "../../../../shared";
import { useCardNumber } from "./hooks/useCardNumber";
import { TextDetailRow, CardNumberRow, BadgeDetailRow } from "./components";

interface CardDetailsListProps {
  card: Card;
}

/**
 * CardDetailsList - Displays all card details in a table format
 */
export function CardDetailsList({ card }: CardDetailsListProps) {
  const t = useTranslations("Cards");
  const { displayNumber, copyToClipboard, isCopied } = useCardNumber(card.cardNumber);

  return (
    <Table>
      <TableBody>
        <TextDetailRow label={t("cardType")} value={card.cardType} />

        <TextDetailRow
          label={t("cardHolder")}
          value={card.cardHolder}
          truncate
        />

        <CardNumberRow
          label={t("cardNumber")}
          displayNumber={displayNumber}
          onCopy={copyToClipboard}
          isCopied={isCopied}
        />

        <TextDetailRow label={t("expiryDate")} value={card.expiryDate} />

        <BadgeDetailRow
          label={t("status")}
          badgeVariant={card.isActive ? "success" : "error"}
          badgeLabel={card.isActive ? t("active") : t("inactive")}
        />

        <BadgeDetailRow
          label={t("security")}
          badgeVariant={card.isLocked ? "warning" : "success"}
          badgeLabel={card.isLocked ? t("locked") : t("unlocked")}
          isLast
        />
      </TableBody>
    </Table>
  );
}
