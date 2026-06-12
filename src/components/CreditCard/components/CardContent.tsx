"use client";

interface CardContentProps {
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  id: string;
}

/**
 * Card content overlay — the PNG card face already contains card number,
 * crypto icons, and VISA logo. Cardholder name is displayed next to the
 * card in the parent layout. No overlay needed.
 */
export function CardContent({
  cardNumber,
  cardHolder,
  expiryDate,
  id,
}: CardContentProps) {
  void cardNumber;
  void cardHolder;
  void expiryDate;
  void id;
  return null;
}
