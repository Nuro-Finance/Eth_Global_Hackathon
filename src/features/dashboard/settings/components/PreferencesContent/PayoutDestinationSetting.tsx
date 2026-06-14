"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Sprint B - Payout destination selector.
 * Controls where market winnings are routed when a user wins a prediction market.
 * Backend: PATCH /api/users/payout-destination (prefix:args format supported).
 * Sprint B ships 'vault' (default) and 'card' (vault→Issuer auto-settle) as functional;
 * other prefixes are accepted but marked "coming soon" until their sprints land.
 */

const FUNCTIONAL_OPTIONS = [
  { value: "vault", label: "Vault (default - keep on Base)" },
  { value: "card", label: "Card (auto-settle winnings to Visa)" },
] as const;

// Future-destination placeholders - user can see the roadmap but selecting them
// returns a "not yet functional" notice. Backend saves the value for forward compat.
const PLACEHOLDER_OPTIONS = [
  { value: "agent:primary", label: "Agent - fund primary agent (coming soon)" },
  { value: "reinvest:latest", label: "Reinvest - auto-place next bet (coming soon)" },
] as const;

export default function PayoutDestinationSetting() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [destination, setDestination] = useState<string>("vault");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token || loaded) return;
    fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (data?.payoutDestination) setDestination(data.payoutDestination);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [token, loaded]);

  const onChange = useCallback(
    async (value: string) => {
      if (!token || value === destination) return;
      setDestination(value); // optimistic
      setSaving(true);
      setNotice(null);
      try {
        const res = await fetch("/api/users/payout-destination", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ destination: value }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotice(body.error || "Update failed");
        } else if (body.note) {
          setNotice(body.note);
        }
      } catch {
        setNotice("Network error");
      } finally {
        setSaving(false);
      }
    },
    [token, destination]
  );

  return (
    <div className="rounded-lg border border-[var(--color-border-primary)] bg-white/3 p-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
            Market Winnings Destination
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-1">
            Where your prediction market winnings are routed on payout.
            Card-settled winnings pay a 5% bridge fee and credit your Visa within minutes.
          </div>
        </div>
        <Select value={destination} onValueChange={onChange}>
          <SelectTrigger className="w-56 bg-white/3 border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {FUNCTIONAL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
            {PLACEHOLDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(saving || notice) && (
        <div className="text-xs text-[var(--color-text-muted)] mt-3">
          {saving ? "Saving..." : notice}
        </div>
      )}
    </div>
  );
}
