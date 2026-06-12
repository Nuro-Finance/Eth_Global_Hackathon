"use client";

import { useMemo, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface CardsSelectorProps {
  cards: { id: string; label: string }[];
  selectedCardIds: string[];
  onSelectedCardIdsChange: (ids: string[]) => void;
}

export function CardsSelector({
  cards,
  selectedCardIds,
  onSelectedCardIdsChange,
}: CardsSelectorProps) {
  const [open, setOpen] = useState(false);
  const [cardSearch, setCardSearch] = useState("");

  const filteredCards = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.label.toLowerCase().includes(q));
  }, [cards, cardSearch]);

  const toggleCard = (id: string) => {
    const next = selectedCardIds.includes(id)
      ? selectedCardIds.filter((x) => x !== id)
      : [...selectedCardIds, id];
    onSelectedCardIdsChange(next);
  };

  useEffect(() => {
    if (!open) setCardSearch("");
  }, [open]);

  if (!cards.length) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
        >
          {selectedCardIds.length ? `${selectedCardIds.length} cards` : "All cards"}
          <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-80 rounded-[var(--radius-card)] p-4"
      >
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Select cards
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Search and select one or more cards to filter transactions.
        </p>

        <div className="space-y-3">
          <Input
            value={cardSearch}
            onChange={(e) => setCardSearch(e.target.value)}
            placeholder="Search cards…"
            size="md"
          />

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectedCardIdsChange([])}
            >
              All cards
            </Button>
            <div className="text-xs text-[var(--color-text-muted)]">
              {selectedCardIds.length ? `${selectedCardIds.length} selected` : "None selected"}
            </div>
          </div>

          <div className="max-h-[280px] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-primary)]">
            <div className="divide-y divide-[var(--color-border-primary)]">
              {filteredCards.map((c) => {
                const checked = selectedCardIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-bg-hover)] cursor-pointer"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleCard(c.id)} />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[var(--color-text-primary)]">
                        {c.label}
                      </div>
                    </div>
                  </label>
                );
              })}
              {filteredCards.length === 0 && (
                <div className="px-3 py-8 text-sm text-[var(--color-text-muted)]">
                  No cards found.
                </div>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
