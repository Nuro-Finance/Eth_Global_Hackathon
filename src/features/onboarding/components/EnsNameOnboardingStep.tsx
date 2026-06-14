"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ensParentDomain, normalizeEnsSlug, validateEnsSlug } from "@/lib/ens/slug";
import { useDebounce } from "@/features/ens/hooks/useDebounce";

export type EnsAvailability = "idle" | "checking" | "available" | "taken";

export function useEnsNameAvailability(slug: string) {
  const debouncedSlug = useDebounce(slug, 350);
  const [availability, setAvailability] = useState<EnsAvailability>("idle");
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = normalizeEnsSlug(debouncedSlug);
    const validationError = normalized.length >= 1 ? validateEnsSlug(normalized) : null;

    if (normalized.length < 2) {
      setAvailability("idle");
      setAvailabilityError(normalized.length > 0 ? validationError : null);
      return;
    }

    if (validationError) {
      setAvailability("taken");
      setAvailabilityError(validationError);
      return;
    }

    let cancelled = false;
    setAvailability("checking");

    const params = new URLSearchParams({
      kind: "business",
      slug: normalized,
    });

    fetch(`/api/ens/check?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setAvailability("taken");
          setAvailabilityError(data.error);
          return;
        }
        setAvailabilityError(null);
        setAvailability(data.available ? "available" : "taken");
        if (!data.available) setAvailabilityError("Already taken");
      })
      .catch(() => {
        if (cancelled) return;
        setAvailability("idle");
        setAvailabilityError(null);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug]);

  return { availability, availabilityError };
}

export function EnsUsernameField({
  slug,
  onSlugChange,
}: {
  slug: string;
  onSlugChange: (slug: string) => void;
}) {
  const parent = ensParentDomain();

  return (
    <div>
      <label
        htmlFor="onboarding-ens-slug"
        className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
      >
        ENS Name
      </label>
      <div className="relative w-full">
        <div
          className={cn(
            "flex h-11 w-full items-center gap-1 rounded-[var(--radius-md)] border border-transparent bg-[var(--color-bg-input)] px-3",
            "focus-within:border-white/20",
          )}
        >
          <input
            id="onboarding-ens-slug"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="yourname"
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
          />
          <span className="shrink-0 text-sm text-[var(--color-text-muted)]">.{parent}</span>
        </div>
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-md)]"
          style={{
            containerType: "size",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "1px",
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute left-1/2 top-1/2 aspect-square h-[200cqmax] w-[200cqmax] -translate-x-1/2 -translate-y-1/2 rounded-full will-change-transform"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0%, transparent 65%, var(--color-primary) 85%, var(--color-text-primary) 92%, var(--color-primary) 98%, transparent 100%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function EnsAvailabilityPanel({
  slug,
  availability,
  availabilityError,
}: {
  slug: string;
  availability: EnsAvailability;
  availabilityError: string | null;
}) {
  const parent = ensParentDomain();
  const normalizedPreview = normalizeEnsSlug(slug);

  const showBubble =
    availability === "checking" ||
    availability === "available" ||
    Boolean(availabilityError);

  return (
    <div className="mt-3">
      <p className="text-center text-sm leading-snug text-[var(--color-text-muted)]">
        This becomes your Nuro identity. Send and receive by name instead of a wallet address.
      </p>
      <div
        className={cn(
          "mt-3 flex h-11 shrink-0 items-center justify-center px-4 text-center text-sm leading-snug",
          showBubble && "rounded-[var(--radius-md)] bg-white/[0.04]",
        )}
      >
        {availability === "checking" ? (
          <span className="inline-flex items-center gap-2 text-[var(--color-text-muted)]">
            <Loader2 className="size-3.5 animate-spin" />
            Checking availability…
          </span>
        ) : availability === "available" ? (
          <span className="inline-flex items-center gap-2 text-emerald-400">
            <Check className="size-3.5" />
            {normalizedPreview}.{parent} is available
          </span>
        ) : availabilityError ? (
          <span className="text-[var(--color-error)]">{availabilityError}</span>
        ) : null}
      </div>
    </div>
  );
}
