"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

const LS_PREFIX = "nuro:wallet-top-assets-order:v1:";

function fullKey(storageKey: string) {
  return `${LS_PREFIX}${storageKey}`;
}

function loadOrder(storageKey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(fullKey(storageKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

function saveOrder(storageKey: string, order: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(fullKey(storageKey), JSON.stringify(order));
  } catch {
    /* ignore quota / private mode */
  }
}

function reorderByIds<T extends { id: string }>(items: T[], order: string[]): T[] {
  const map = new Map(items.map((it) => [it.id, it] as const));
  const out: T[] = [];
  for (const id of order) {
    const row = map.get(id);
    if (row) {
      out.push(row);
      map.delete(id);
    }
  }
  for (const rest of map.values()) {
    out.push(rest);
  }
  return out;
}

export function usePersistedIdOrder<T extends { id: string }>({
  storageKey,
  items,
}: {
  storageKey: string;
  items: T[];
}) {
  const [order, setOrder] = useState<string[]>(() => {
    const stored = loadOrder(storageKey);
    return stored?.length ? stored : items.map((i) => i.id);
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  const orderedItems = useMemo(() => reorderByIds(items, order), [items, order]);

  useEffect(() => {
    const currentIds = new Set(items.map((i) => i.id));
    const stored = loadOrder(storageKey);
    if (stored) {
      const valid = stored.filter((id) => currentIds.has(id));
      const newIds = items.map((i) => i.id).filter((id) => !valid.includes(id));
      setOrder([...valid, ...newIds]);
    } else {
      setOrder(items.map((i) => i.id));
    }
  }, [items, storageKey]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (over && active.id !== over.id) {
        setOrder((prev) => {
          const oldIndex = prev.findIndex((id) => id === active.id);
          const newIndex = prev.findIndex((id) => id === over.id);
          if (oldIndex < 0 || newIndex < 0) return prev;
          const next = arrayMove(prev, oldIndex, newIndex);
          saveOrder(storageKey, next);
          return next;
        });
      }
      setActiveId(null);
    },
    [storageKey]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const itemIds = useMemo(() => orderedItems.map((i) => i.id), [orderedItems]);

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    return orderedItems.find((i) => i.id === activeId) ?? null;
  }, [activeId, orderedItems]);

  return {
    orderedItems,
    itemIds,
    activeId,
    activeItem,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
