"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { MOCK_CARDS } from "@/config/mock-data";
import { MY_CARD_NOIR_GRADIENT } from "@/lib/cardSkins";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, X } from "lucide-react";
import { useAppSession } from "@/hooks/useAppSession";

/** Bump when `public/Nuro Black Card - Home Page.png` changes to bust browser cache. */
export const PRIMARY_DECK_C1_FACE_CACHE_VERSION = "20260522-front-r14";
/** Front tier (stack position 1) — card art with stroke baked in. */
export const PRIMARY_DECK_C1_FACE_SRC = `/Nuro%20Black%20Card%20-%20Home%20Page.png?v=${PRIMARY_DECK_C1_FACE_CACHE_VERSION}`;

/** Bump when `public/Nuro Black Card - Home Page - No Stroke.png` changes. */
export const PRIMARY_DECK_STACK_BEHIND_FACE_CACHE_VERSION = "20260522-nostroke-3";
/** Stack tiers 2–3 — `Nuro Black Card - Home Page - No Stroke.png` */
export const PRIMARY_DECK_STACK_BEHIND_FACE_SRC = `/Nuro%20Black%20Card%20-%20Home%20Page%20-%20No%20Stroke.png?v=${PRIMARY_DECK_STACK_BEHIND_FACE_CACHE_VERSION}`;

export function resolvePrimaryDeckTierFaceSrc(stackIndex: number): string {
  return stackIndex === 0 ? PRIMARY_DECK_C1_FACE_SRC : PRIMARY_DECK_STACK_BEHIND_FACE_SRC;
}

function withPrimaryDeckFaces(deck: PrimaryDeckItem[]): PrimaryDeckItem[] {
  return deck.map((item, idx) => ({
    ...item,
    faceSrc: resolvePrimaryDeckTierFaceSrc(idx),
  }));
}

export type PrimaryDeckItem = {
  id: string;
  gradient?: string;
  faceSrc?: string;
  role?: "deck-cta-plus" | "deck-cta-pro";
};

export const DECK_CTA_PLUS_ID = "__deck-cta-plus";
export const DECK_CTA_PRO_ID = "__deck-cta-pro";
/** Paid tiers 2–3 unset (no card picked); allowed twice in the stack. */
export const DECK_SLOT_EMPTY_ID = "__deck_slot_empty__";

function isSubscriptionFreePlan(sub: { plan_name?: string } | null | undefined): boolean {
  if (!sub) return true;
  const n = String(sub.plan_name ?? "Free").trim().toLowerCase();
  return n === "free";
}

export function isDeckCtaRole(role: PrimaryDeckItem["role"]): role is "deck-cta-plus" | "deck-cta-pro" {
  return role === "deck-cta-plus" || role === "deck-cta-pro";
}

const PRIMARY_DECK_STACK_STORAGE_KEY = "overview.primaryDeck.ids.v1";

export const DEFAULT_PRIMARY_DECK: PrimaryDeckItem[] = [
  { id: "c1", gradient: undefined, faceSrc: PRIMARY_DECK_C1_FACE_SRC },
  {
    id: DECK_CTA_PLUS_ID,
    gradient: MY_CARD_NOIR_GRADIENT,
    faceSrc: PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
    role: "deck-cta-plus",
  },
  {
    id: DECK_CTA_PRO_ID,
    gradient: MY_CARD_NOIR_GRADIENT,
    faceSrc: PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
    role: "deck-cta-pro",
  },
];

function hydrateFromId(id: string): PrimaryDeckItem | null {
  if (id === DECK_SLOT_EMPTY_ID) {
    return {
      id: DECK_SLOT_EMPTY_ID,
      gradient: MY_CARD_NOIR_GRADIENT,
      faceSrc: PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
    };
  }
  if (id === DECK_CTA_PLUS_ID) {
    return {
      id: DECK_CTA_PLUS_ID,
      gradient: MY_CARD_NOIR_GRADIENT,
      faceSrc: PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
      role: "deck-cta-plus",
    };
  }
  if (id === DECK_CTA_PRO_ID) {
    return {
      id: DECK_CTA_PRO_ID,
      gradient: MY_CARD_NOIR_GRADIENT,
      faceSrc: PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
      role: "deck-cta-pro",
    };
  }
  const mc = MOCK_CARDS.find((c) => c.id === id);
  if (!mc) return null;
  return {
    id: mc.id,
    gradient: mc.gradient,
    faceSrc: mc.id === "c1" ? PRIMARY_DECK_C1_FACE_SRC : PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
  };
}

function loadPersistedDeck(): PrimaryDeckItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRIMARY_DECK_STACK_STORAGE_KEY);
    if (!raw) return null;
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids) || ids.length !== 3 || !ids.every((x) => typeof x === "string")) return null;
    const items = (ids as string[]).map((id) => hydrateFromId(id));
    if (items.some((x) => x == null)) return null;
    return items as PrimaryDeckItem[];
  } catch {
    return null;
  }
}

type PrimaryDeckStackContextValue = {
  primaryDeck: PrimaryDeckItem[];
  setPrimaryDeck: Dispatch<SetStateAction<PrimaryDeckItem[]>>;
  rotatePrimaryDeck: (delta: 1 | -1) => void;
  openStackSettings: () => void;
};

const PrimaryDeckStackContext = createContext<PrimaryDeckStackContextValue | null>(null);

export function usePrimaryDeckStack(): PrimaryDeckStackContextValue {
  const ctx = useContext(PrimaryDeckStackContext);
  if (!ctx) {
    throw new Error("usePrimaryDeckStack must be used within PrimaryDeckStackProvider");
  }
  return ctx;
}

/** Header / optional consumers when the provider may be absent. */
export function usePrimaryDeckStackOptional(): PrimaryDeckStackContextValue | null {
  return useContext(PrimaryDeckStackContext);
}

type DeckStackOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: PrimaryDeckItem[];
  onApply: (next: PrimaryDeckItem[]) => void;
  subscriptionReady: boolean;
  isPaidPlan: boolean;
};

/** Cap height when pickers open long lists; shell height follows content (unlike fixed-step reload/withdraw). */
const DECK_STACK_MODAL_MAX_HEIGHT = "max-h-[min(540px,85vh)]";

/** ReloadFlow picker panel: border, fill, token radii (no heavy outer shadow — avoids square halo compositing). */
const DECK_STACK_RELOAD_PICKER_PANEL = cn(
  "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-t-[var(--radius-md)] rounded-b-[var(--radius-xl)]",
  "border border-[var(--color-border-primary)] bg-[var(--color-bg-picker-panel)] shadow-none",
);

/** Shared column layout (inset `DECK_STACK_PICKER_INSET_X` on header + list so hover/selection never touches the panel edge). */
const DECK_STACK_PICKER_LINE_GRID =
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center gap-3";
const DECK_STACK_PICKER_INSET_X = "px-4";

/** Same footprint as `SelectTrigger` (`h-10`). */
const DECK_STACK_SLOT_TRIGGER_CLASS = cn(
  "flex h-10 w-full items-center justify-between rounded-md border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass-strong)] text-[var(--color-text-primary)] px-3 py-2 text-sm outline-none ring-offset-background",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/20 focus-visible:ring-offset-0 focus-visible:border-[var(--color-primary)]/50",
);

function slotsHaveInvalidDuplicate(slots: [string, string, string]): boolean {
  const seen = new Set<string>();
  for (const id of slots) {
    if (id === DECK_SLOT_EMPTY_ID) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

function DeckStackOrderDialog({
  open,
  onOpenChange,
  deck,
  onApply,
  subscriptionReady,
  isPaidPlan,
}: DeckStackOrderDialogProps) {
  const tDash = useTranslations("Dashboard");
  const [pickerOpenFor, setPickerOpenFor] = useState<0 | 1 | 2 | null>(null);
  const [slots, setSlots] = useState<[string, string, string]>(() => [
    deck[0]?.id ?? "c1",
    deck[1]?.id ?? DECK_CTA_PLUS_ID,
    deck[2]?.id ?? DECK_CTA_PRO_ID,
  ]);

  useEffect(() => {
    if (!open) setPickerOpenFor(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const d = deck.slice(0, 3);
    while (d.length < 3) d.push(DEFAULT_PRIMARY_DECK[d.length]!);
    setSlots([d[0]!.id, d[1]!.id, d[2]!.id]);
  }, [open, deck]);

  const optionRows = useMemo(() => {
    const mocks = MOCK_CARDS.map((c) => ({ value: c.id, label: c.cardName }));
    if (isPaidPlan) {
      return [
        { value: DECK_SLOT_EMPTY_ID, label: "-" },
        ...mocks,
      ];
    }
    return [
      ...mocks,
      { value: DECK_CTA_PLUS_ID, label: tDash("deckStackOptionNuroPlusSlot") },
      { value: DECK_CTA_PRO_ID, label: tDash("deckStackOptionNuroProSlot") },
    ];
  }, [tDash, isPaidPlan]);

 /** Current choice first so the open picker always shows the selection at the top of the list. */
  const pickerListRows = useMemo(() => {
    if (pickerOpenFor === null) return optionRows;
    const currentId = slots[pickerOpenFor];
    const selectedRow = optionRows.find((r) => r.value === currentId);
    if (!selectedRow) return optionRows;
    return [selectedRow, ...optionRows.filter((r) => r.value !== currentId)];
  }, [pickerOpenFor, slots, optionRows]);

  const duplicateError = useMemo(() => slotsHaveInvalidDuplicate(slots), [slots]);

 /** Until subscription resolves, prefer free-tier copy on slots 2–3 to avoid a brief paid dash for free users. */
  const showUpgradeCopyOnSlots23 = !subscriptionReady || !isPaidPlan;

  const slotTriggerLabel = useCallback(
    (i: 0 | 1 | 2) => {
      if (showUpgradeCopyOnSlots23 && (i === 1 || i === 2)) {
        return tDash("deckStackOptionUpgradeMoreCards");
      }
      if (subscriptionReady && isPaidPlan && (i === 1 || i === 2) && slots[i] === DECK_SLOT_EMPTY_ID) {
        return "-";
      }
      return optionRows.find((r) => r.value === slots[i])?.label ?? slots[i];
    },
    [showUpgradeCopyOnSlots23, subscriptionReady, isPaidPlan, slots, optionRows, tDash],
  );

  const closePicker = useCallback(() => setPickerOpenFor(null), []);

  const apply = () => {
    if (duplicateError) return;
    const next = slots.map((id) => hydrateFromId(id)).filter(Boolean) as PrimaryDeckItem[];
    if (next.length === 3) onApply(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(
          "notifications-full-dialog z-[110] flex h-auto min-h-0 flex-col gap-0 overflow-hidden p-2.5 sm:p-3",
          "w-[calc(100vw-2rem)] max-w-[min(32rem,calc(100vw-2rem))] !rounded-[56px] backdrop-blur-md shadow-xl",
          DECK_STACK_MODAL_MAX_HEIGHT,
        )}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className="relative flex w-full min-w-0 flex-col overflow-hidden rounded-[44px] border !backdrop-blur-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <div className="relative z-20 shrink-0 overflow-visible px-5 pb-3 pt-5 sm:px-6 sm:pb-3.5 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-start">
                <DialogTitle className="relative m-0 min-w-0 text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                  {tDash("deckStackOrderDialogTitle")}
                </DialogTitle>
                <DialogDescription className="m-0 text-[13px] font-medium leading-snug text-[var(--color-text-muted)]">
                  {tDash("deckStackOrderDialogDescription")}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  className={cn(
                    "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none",
                    "transition-[color,background-color,opacity] duration-200 ease-out",
                    "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                    "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                  )}
                  aria-label="Close"
                >
                  <X className="h-full w-full" strokeWidth={2} aria-hidden />
                </button>
              </DialogClose>
            </div>
          </div>

          <div className="shrink-0 px-5 pt-0 pb-6 sm:px-6">
            <div className="relative z-0 overflow-hidden">
              <div
                className={cn(
                  "relative",
 /* Host matches picker fill + bottom curve so parent shell never shows in the curve wedges; clips stray layers. */
                  pickerOpenFor !== null &&
                    "isolate overflow-hidden rounded-b-[var(--radius-xl)] rounded-t-[var(--radius-md)] bg-[var(--color-bg-picker-panel)]",
                )}
              >
                <div
                  className={cn(pickerOpenFor !== null && "invisible pointer-events-none")}
                  aria-hidden={pickerOpenFor !== null}
                >
                  {([0, 1, 2] as const).map((i) => {
                    const selectedLabel = slotTriggerLabel(i);
                    return (
                      <div key={i} className={cn("grid gap-1.5", i > 0 && "mt-4")}>
                        <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                          {tDash("deckStackPosition", { position: i + 1 })}
                        </span>
                        <button
                          type="button"
                          className={DECK_STACK_SLOT_TRIGGER_CLASS}
                          aria-expanded={pickerOpenFor === i}
                          aria-haspopup="listbox"
                          onClick={() => setPickerOpenFor(i)}
                        >
                          <span className="line-clamp-1 min-w-0 text-left">{selectedLabel}</span>
                          <ChevronDown
                            className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)] opacity-50"
                            aria-hidden
                          />
                        </button>
                      </div>
                    );
                  })}
                  {duplicateError ? (
                    <p className="mt-3 text-[12px] font-medium text-[var(--color-error)]">
                      {tDash("deckStackDuplicatesError")}
                    </p>
                  ) : null}

                  <div className="flex shrink-0 justify-end pt-6">
                    <div className="relative">
                      <div
                        className="invisible flex gap-2 pointer-events-none select-none"
                        aria-hidden="true"
                      >
                        <Button type="button" variant="outline" tabIndex={-1}>
                          {tDash("cancel")}
                        </Button>
                        <Button
                          type="button"
                          tabIndex={-1}
                          className="!text-white hover:!text-white focus-visible:!text-white"
                        >
                          {tDash("deckStackApply")}
                        </Button>
                      </div>
                      <div className="absolute inset-0">
                        <Button
                          type="button"
                          onClick={apply}
                          disabled={duplicateError}
                          className="h-full w-full !text-white hover:!text-white focus-visible:!text-white"
                        >
                          {tDash("deckStackApply")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {pickerOpenFor !== null ? (
                  <div
                    aria-label={tDash("deckStackPickerOverlayAria")}
                    className={cn(
                      "absolute inset-0 z-[45] min-h-0 overflow-hidden",
                      DECK_STACK_RELOAD_PICKER_PANEL,
                    )}
                  >
                    <div
                      className={cn(
                        "min-h-0 shrink-0 py-[16px]",
                        DECK_STACK_PICKER_INSET_X,
                        DECK_STACK_PICKER_LINE_GRID,
                      )}
                    >
                      <span className="min-w-0 truncate pl-4 text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">
                        {tDash("deckStackPickerHeading", { position: pickerOpenFor + 1 })}
                      </span>
                      <button
                        type="button"
                        aria-label={tDash("deckStackPickerCloseAria")}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center justify-self-end rounded-[var(--radius-sm)] bg-transparent text-[var(--color-text-muted)] outline-none ring-0 transition-colors hover:bg-white/[0.05] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-0"
                        onClick={closePicker}
                      >
                        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden rounded-b-[var(--radius-xl)]">
                      <div
                        className="scrollbar-autohide scroll-gutter-stable relative max-h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-b-[var(--radius-xl)] pb-[16px] pt-0 outline-none"
                        role="listbox"
                      >
                        <div className={cn("flex min-h-0 flex-col gap-0", DECK_STACK_PICKER_INSET_X)}>
                          {pickerListRows.map((row) => {
                            const selected = slots[pickerOpenFor] === row.value;
                            return (
                              <button
                                key={row.value}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={cn(
                                  DECK_STACK_PICKER_LINE_GRID,
                                  "min-h-0 rounded-[var(--radius-md)] py-2 text-left text-sm outline-none ring-0 transition-colors",
                                  "focus-visible:bg-transparent focus-visible:outline-none focus-visible:ring-0",
                                  selected
                                    ? "bg-white/[0.04] text-[var(--color-text-primary)]"
                                    : "text-[var(--color-text-muted)] hover:bg-white/[0.04]",
                                )}
                                onClick={() => {
                                  const idx = pickerOpenFor;
                                  setSlots((prev) => {
                                    const copy: [string, string, string] = [...prev];
                                    copy[idx] = row.value;
                                    return copy;
                                  });
                                  closePicker();
                                }}
                              >
                                <span className="min-w-0 truncate pl-4 font-medium leading-snug">{row.label}</span>
                                <span
                                  className="flex h-8 w-8 shrink-0 items-center justify-center justify-self-end"
                                  aria-hidden
                                >
                                  {selected ? (
                                    <Check className="h-4 w-4 text-[var(--color-text-primary)]" strokeWidth={2.5} />
                                  ) : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PrimaryDeckStackProvider({ children }: { children: ReactNode }) {
  const { data: session } = useAppSession();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  const [subscription, setSubscription] = useState<{ plan_name?: string } | null>(null);
  const [subscriptionReady, setSubscriptionReady] = useState(false);

  const [primaryDeck, setPrimaryDeck] = useState<PrimaryDeckItem[]>(DEFAULT_PRIMARY_DECK);
  const [stackDialogOpen, setStackDialogOpen] = useState(false);
  const skipNextPersist = useRef(true);

  useEffect(() => {
    const loaded = loadPersistedDeck();
    setPrimaryDeck(withPrimaryDeckFaces(loaded ?? DEFAULT_PRIMARY_DECK));
  }, []);

  useEffect(() => {
    setPrimaryDeck((prev) => withPrimaryDeckFaces(prev));
  }, [PRIMARY_DECK_C1_FACE_CACHE_VERSION, PRIMARY_DECK_STACK_BEHIND_FACE_CACHE_VERSION]);

  useEffect(() => {
    if (!token) {
      setSubscription(null);
      setSubscriptionReady(true);
      return;
    }
    setSubscriptionReady(false);
    const h = { Authorization: `Bearer ${token}` };
    fetch("/api/subscriptions/me", { headers: h })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setSubscription(d && typeof d === "object" ? d : null);
      })
      .catch(() => setSubscription(null))
      .finally(() => setSubscriptionReady(true));
  }, [token]);

  const isPaidPlan = subscriptionReady && subscription != null && !isSubscriptionFreePlan(subscription);

  useEffect(() => {
    if (!isPaidPlan) return;
    setPrimaryDeck((prev) => {
      if (prev.length !== 3) return prev;
      let changed = false;
      const next = prev.map((item, idx) => {
        if (idx > 0 && isDeckCtaRole(item.role)) {
          changed = true;
          return {
            id: DECK_SLOT_EMPTY_ID,
            gradient: MY_CARD_NOIR_GRADIENT,
            faceSrc: PRIMARY_DECK_STACK_BEHIND_FACE_SRC,
          };
        }
        return item;
      });
      return changed ? withPrimaryDeckFaces(next) : prev;
    });
  }, [isPaidPlan]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(
        PRIMARY_DECK_STACK_STORAGE_KEY,
        JSON.stringify(primaryDeck.map((d) => d.id)),
      );
    } catch {
 /* ignore */
    }
  }, [primaryDeck]);

  const rotatePrimaryDeck = useCallback((delta: 1 | -1) => {
    setPrimaryDeck((prev) => {
      if (prev.length <= 1) return prev;
      const rotated =
        delta === 1
          ? [...prev.slice(1), prev[0]!]
          : [prev[prev.length - 1]!, ...prev.slice(0, -1)];
      return withPrimaryDeckFaces(rotated);
    });
  }, []);

  const openStackSettings = useCallback(() => setStackDialogOpen(true), []);

  const value = useMemo(
    () => ({
      primaryDeck,
      setPrimaryDeck,
      rotatePrimaryDeck,
      openStackSettings,
    }),
    [primaryDeck, rotatePrimaryDeck, openStackSettings],
  );

  return (
    <PrimaryDeckStackContext.Provider value={value}>
      {children}
      <DeckStackOrderDialog
        open={stackDialogOpen}
        onOpenChange={setStackDialogOpen}
        deck={primaryDeck}
        subscriptionReady={subscriptionReady}
        isPaidPlan={isPaidPlan}
        onApply={(next) => {
          setPrimaryDeck(withPrimaryDeckFaces(next));
          setStackDialogOpen(false);
        }}
      />
    </PrimaryDeckStackContext.Provider>
  );
}
