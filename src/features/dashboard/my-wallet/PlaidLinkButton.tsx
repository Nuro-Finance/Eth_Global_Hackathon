"use client";

// ─── PlaidLinkButton — Session 28 Phase 8 scaffold ───────────────────────────
// Buy 2 entry point. Loads Plaid's CDN script lazily, fetches a link_token
// from our backend, and opens Plaid Link. On success, posts public_token
// back so the server can exchange → access_token → Dwolla processor_token →
// funding source → transfer initiation.
//
// Why CDN script (not `react-plaid-link` npm package):
//   • Zero new deps — keeps package.json minimal (Richard's stability rule).
//   • Plaid's CDN bundle is always latest — no lockfile drift to manage.
//   • Drop-in with react-plaid-link later if we want typed hooks.
//
// Flag-gated upstream: parent BuyPanel only renders this when
// NEXT_PUBLIC_BUY_2_ENABLED === 'true'. The component itself doesn't re-check
// because the parent is the authoritative gate.

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Plaid?: {
      create: (opts: {
        token: string;
        onSuccess: (publicToken: string, metadata: any) => void;
        onExit?: (err: any, metadata: any) => void;
        onEvent?: (eventName: string, metadata: any) => void;
      }) => { open: () => void; exit: () => void; destroy: () => void };
    };
  }
}

const PLAID_CDN = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

/**
 * Load Plaid Link script once per page. Returns a promise that resolves when
 * `window.Plaid` is available. Safe to call multiple times — de-duped via
 * a module-level promise cache.
 */
let _plaidLoader: Promise<void> | null = null;
function ensurePlaidLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Plaid) return Promise.resolve();
  if (_plaidLoader) return _plaidLoader;

  _plaidLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PLAID_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid CDN failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = PLAID_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Plaid CDN failed"));
    document.head.appendChild(s);
  });
  return _plaidLoader;
}

export interface PlaidLinkButtonProps {
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Called when the full Link → exchange → Dwolla funding source flow completes. */
  onLinked?: (result: { itemId: string; fundingSourceUrl: string | null }) => void;
  /** Called on Plaid Link exit or server exchange failure. */
  onError?: (err: Error) => void;
}

/**
 * Button wrapper that initializes Plaid Link on click.
 *
 * Flow:
 *   1. On mount: lazy-load Plaid CDN.
 *   2. On click: POST /nuro/buy-from-bank/link-token → { link_token }
 *   3. Call window.Plaid.create({ token, onSuccess, onExit }).open()
 *   4. On Plaid success: POST /nuro/buy-from-bank/link-complete with public_token + account_id
 *      → server exchanges + creates Dwolla customer + funding source
 *   5. onLinked callback fires with funding_source_url (ready for Buy 2 transfer)
 */
export function PlaidLinkButton({
  disabled,
  className,
  children,
  onLinked,
  onError,
}: PlaidLinkButtonProps) {
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const handlerRef = useRef<ReturnType<NonNullable<Window["Plaid"]>["create"]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensurePlaidLoaded()
      .then(() => {
        if (!cancelled) setScriptReady(true);
      })
      .catch((err) => {
        if (!cancelled) onError?.(err);
      });
    return () => {
      cancelled = true;
      handlerRef.current?.destroy?.();
    };
  }, [onError]);

  const handleClick = async () => {
    if (disabled || loading || !scriptReady) return;
    if (!window.Plaid) {
      onError?.(new Error("Plaid not loaded yet"));
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch link_token from backend
      const tokenRes = await fetch("/api/nuro/buy-from-bank/link-token", {
        method: "POST",
        credentials: "include",
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error || `link-token ${tokenRes.status}`);
      }
      const { link_token } = await tokenRes.json();

      // 2. Open Plaid Link
      const handler = window.Plaid.create({
        token: link_token,
        onSuccess: async (publicToken, metadata) => {
          try {
            const accountId = metadata?.accounts?.[0]?.id;
            const completeRes = await fetch("/api/nuro/buy-from-bank/link-complete", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, accountId }),
            });
            if (!completeRes.ok) {
              const body = await completeRes.json().catch(() => ({}));
              throw new Error(body.error || `link-complete ${completeRes.status}`);
            }
            const result = await completeRes.json();
            onLinked?.({
              itemId: result.itemId,
              fundingSourceUrl: result.fundingSourceUrl ?? null,
            });
          } catch (err: any) {
            onError?.(err);
          } finally {
            setLoading(false);
          }
        },
        onExit: (err) => {
          setLoading(false);
          if (err) onError?.(new Error(err.display_message || err.error_message || "Plaid Link exited"));
        },
      });
      handlerRef.current = handler;
      handler.open();
    } catch (err: any) {
      setLoading(false);
      onError?.(err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading || !scriptReady}
      className={className}
    >
      {loading ? "Opening Plaid…" : children}
    </button>
  );
}
