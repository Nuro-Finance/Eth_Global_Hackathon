"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Autocomplete recipient picker for P2P transfers. Replaces the pair of
 * free-text inputs that required the sender to know the recipient's email
 * exactly — one typo = 404. Now types a few chars → dropdown of Nuro users.
 *
 * Backend: GET /api/users/search?q=<text> returns up to 10 matches.
 * Ranking: exact email > email prefix > name prefix.
 *
 * Behavior:
 * - Debounced 250ms; min 2 chars before query fires
 * - On select: calls onSelect with {id, email, name, hasCard} so the parent
 * form can hydrate both `recipient` (name) and `recipientEmail` fields
 * - `hasCard` exposed so DestinationToggle can disable the "Card" option
 * when the recipient hasn't completed KYC
 * - No dropdown while the input is empty; single-click-outside to dismiss
 */

export interface RecipientUser {
    id: string;
    email: string;
    name: string | null;
    hasCard: boolean;
}

interface RecipientSearchProps {
    value: string;
    onChange: (text: string) => void;
    onSelect: (user: RecipientUser) => void;
    selectedEmail?: string;
    error?: string;
}

export function RecipientSearch({
    value,
    onChange,
    onSelect,
    selectedEmail,
    error,
}: RecipientSearchProps) {
    const { data: session } = useSession();
    const [results, setResults] = useState<RecipientUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

 // Debounced fetch
    useEffect(() => {
        const q = value.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
 // If the current input exactly equals the selected email, user just picked — skip
        if (selectedEmail && q === selectedEmail) {
            setResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
                    headers: { Authorization: `Bearer ${session?.accessToken || ""}` },
                });
                const data = await res.json().catch(() => []);
                setResults(Array.isArray(data) ? data : []);
                setOpen(true);
            } catch (err) {
                console.error("[RecipientSearch] fetch failed:", err);
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [value, selectedEmail, session?.accessToken]);

 // Click-outside to close dropdown
    useEffect(() => {
        function onDocClick(e: MouseEvent) {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        }
        if (open) document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    const handleSelect = (user: RecipientUser) => {
        onSelect(user);
        setOpen(false);
        setResults([]);
    };

    return (
        <div ref={rootRef} className="relative flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[var(--color-text-primary)]">
                Recipient (Nuro user)
            </label>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    placeholder="Search by email or name (min 2 chars)"
                    autoComplete="off"
                    className={cn(
                        "w-full h-10 pl-9 pr-3 bg-[var(--color-bg-input)] border rounded-[10px] text-[13px] font-medium outline-none transition-colors",
                        error
                            ? "border-[var(--color-error)]"
                            : "border-[var(--color-border-input)] focus:border-[var(--color-border-input-hover)]"
                    )}
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[var(--color-text-muted)] border-t-transparent rounded-full animate-spin" />
                )}
            </div>

            {error && (
                <div className="flex items-center gap-1 text-[11px] text-[var(--color-error)]">
                    <AlertCircle className="w-3 h-3" />
                    <span>{error}</span>
                </div>
            )}

            {open && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto z-50 rounded-[10px] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg">
                    {results.map((user) => (
                        <button
                            key={user.id}
                            type="button"
                            onClick={() => handleSelect(user)}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-[var(--color-bg-hover)] transition-colors text-left"
                        >
                            <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                                    {user.name || user.email.split("@")[0]}
                                </span>
                                <span className="text-[11px] text-[var(--color-text-muted)] truncate">
                                    {user.email}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {user.hasCard && (
                                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-success)] bg-[var(--color-success)]/10 rounded px-1.5 py-0.5">
                                        Card ✓
                                    </span>
                                )}
                                {selectedEmail === user.email && (
                                    <Check className="w-4 h-4 text-[var(--color-success)]" />
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {open && !loading && results.length === 0 && value.trim().length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-[10px] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg px-3 py-2.5">
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                        No Nuro users match "{value.trim()}"
                    </span>
                </div>
            )}
        </div>
    );
}
