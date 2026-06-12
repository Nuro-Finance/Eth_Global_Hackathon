"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, ArrowRight, X, Loader2 } from "lucide-react";
import { isKycVerified } from "@/lib/kyc-status";

async function getToken(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/session");
    const s = await r.json();
    return s?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function getProfile(token: string): Promise<{ firstName?: string; lastName?: string; name?: string } | null> {
  try {
    const r = await fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return {
      firstName: u.firstName || undefined,
      lastName: u.lastName || undefined,
      name: u.name || undefined,
    };
  } catch {
    return null;
  }
}

type KycStatus = "not_started" | "pending" | "approved" | "active" | "rejected" | "loading" | "hidden";

export default function KycBanner() {
  const [status, setStatus] = useState<KycStatus>("loading");
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Name-prompt modal — opens when the user clicks Verify without having
  // completed onboarding yet. SD3 requires a real legal first + last name
  // and the OAuth profile we get from Google is often a single-word
  // handle ("PlainPaper"), so we prompt explicitly.
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    getToken().then((t) => {
      setToken(t);
      if (!t) { setStatus("hidden"); return; }
      fetch(`/api/kyc/status`, {
        headers: { Authorization: `Bearer ${t}` },
      })
        .then((r) => r.json())
        .then((data) => {
          setStatus(data.status ?? "hidden");
          setKycUrl(data.kycUrl ?? null);
        })
        .catch(() => setStatus("hidden"));
    });
  }, []);

  // Listen for "open KYC modal" events from other parts of the app (e.g. the
  // pre-KYC gate on /my-card). Keeps trigger logic centralized here.
  useEffect(() => {
    const onOpen = () => { void handleVerify(); };
    window.addEventListener("nuro:verify-kyc", onOpen);
    return () => window.removeEventListener("nuro:verify-kyc", onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kycUrl]);

  // Pre-fill the modal with whatever we know when it opens.
  const openNamePrompt = async () => {
    setNameError(null);
    // Always reset before opening — prevents stale values from a previous
    // attempt from carrying over (e.g. user closed mid-flow).
    setFirstName("");
    setLastName("");
    if (token) {
      const prof = await getProfile(token);
      if (prof?.firstName) setFirstName(prof.firstName);
      if (prof?.lastName) setLastName(prof.lastName);
      if (!prof?.firstName && !prof?.lastName && prof?.name) {
        // Day-7 fix: the inline LoginLayout signup sets user.name to the
        // email-prefix (e.g. "chris+demo" from "chris+demo@gmail.com"). Pre-filling the First
        // Name field with that looks like an email leak to investors.
        // Heuristic: only pre-fill if the stored name is plausibly a
        // real "Firstname Lastname" — has a space and no obvious
        // email-handle markers (@, +, dots-without-spaces). Otherwise
        // leave both fields blank so the user types their legal name.
        const name = prof.name.trim();
        const hasSpace = /\s/.test(name);
        const looksLikeEmailHandle = !hasSpace && /[@+]|^[a-zA-Z0-9._-]+$/.test(name);
        if (hasSpace && !looksLikeEmailHandle) {
          const parts = name.split(/\s+/).filter(Boolean);
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
        }
      }
    }
    setNamePromptOpen(true);
  };

  const handleVerify = async () => {
    if (!token) return;
    // Already onboarded — re-open the stored KYC URL
    if (kycUrl) { window.open(kycUrl, "_blank"); return; }
    // Not yet onboarded — prompt for legal name before calling /kyc/start
    await openNamePrompt();
  };

  const submitNameAndStart = async () => {
    if (!token) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      setNameError("First and last name are both required");
      return;
    }
    if (fn.length < 2 || ln.length < 2) {
      setNameError("Please enter your full legal name");
      return;
    }
    setNameError(null);
    setStarting(true);

    // Day-7 popup-blocker fix: browsers strip the "user gesture" context
    // after an `await`, which means `window.open(kycUrl, "_blank")` AFTER
    // the fetch was being silently blocked on the FIRST attempt. Second
    // attempt worked because by then `kycUrl` was cached and
    // `handleVerify` called `window.open` synchronously in the onClick.
    //
    // Fix: open about:blank IMMEDIATELY (while we're still inside the
    // synchronous click handler), then redirect that placeholder window
    // to the real KYC URL once the fetch resolves. If the placeholder
    // was blocked anyway (e.g. iOS Safari with strict rules), fall back
    // to same-tab navigation so the user still reaches SD3.
    const placeholderWindow = window.open("about:blank", "_blank");

    try {
      const r = await fetch(`/api/kyc/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ firstName: fn, lastName: ln }),
      });
      const data = await r.json();
      if (r.ok && data.kycUrl) {
        setKycUrl(data.kycUrl);
        setStatus(data.status ?? "pending");
        setNamePromptOpen(false);
        if (placeholderWindow && !placeholderWindow.closed) {
          placeholderWindow.location.href = data.kycUrl;
        } else {
          // Placeholder was blocked even synchronously — fall back to
          // same-tab navigation so the user reaches the KYC page.
          window.location.href = data.kycUrl;
        }
      } else {
        // No URL to send the user to — close the placeholder we opened.
        placeholderWindow?.close();
        setNameError(data?.error || "Could not start verification. Please try again.");
      }
    } catch {
      placeholderWindow?.close();
      setNameError("Could not start verification. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  // 2026-05-25: defense-in-depth against legacy DB rows with non-canonical
  // KYC labels (verified, kyc_complete, passed, etc.). isKycVerified()
  // matches the full SD3-synonym set from src/lib/kyc-status. Backend
  // /kyc/status now also normalizes, so this is belt-and-suspenders.
  const show = !dismissed && !isKycVerified(status) && status !== "hidden" && status !== "loading";

  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mx-3 sm:mx-4 md:mx-5 mb-3 sm:mb-4 rounded-[var(--radius-lg)] border border-[rgba(255,171,0,0.3)] bg-[rgba(255,171,0,0.1)] backdrop-blur-sm px-4 py-3 flex items-center gap-3"
          >
            <div className="h-8 w-8 shrink-0 rounded-[var(--radius-md)] bg-[rgba(255,171,0,0.2)] flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-[var(--color-warning)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                Verify your identity to unlock your card
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                {status === "pending"
                  ? "Your KYC is in progress. Complete the steps to activate your card."
                  : "Complete a quick identity check to start spending with Nuro."}
              </p>
            </div>
            <button
              onClick={handleVerify}
              disabled={starting}
              className="shrink-0 flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-warning)] hover:bg-[#FFC033] disabled:opacity-60 transition-colors px-3 py-1.5 text-[12px] font-semibold text-white"
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  {kycUrl ? "Continue" : "Verify Now"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors ml-1"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name-prompt modal — SD3 KYC needs real legal first + last name */}
      <AnimatePresence>
        {namePromptOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => !starting && setNamePromptOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[var(--radius-lg)] border border-white/10 bg-[var(--color-bg-primary)] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="h-9 w-9 shrink-0 rounded-[var(--radius-md)] bg-[rgba(255,171,0,0.2)] flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5 text-[var(--color-warning)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                    Verify your identity
                  </h3>
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-1">
                    Enter your legal first and last name. These must match your government ID.
                  </p>
                </div>
                <button
                  onClick={() => !starting && setNamePromptOpen(false)}
                  disabled={starting}
                  className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    First name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setNameError(null); }}
                    disabled={starting}
                    autoFocus
                    className="w-full rounded-[var(--radius-md)] bg-white/5 border border-white/10 px-3 py-2 text-[14px] text-[var(--color-text-primary)] outline-none focus:border-[rgba(255,171,0,0.6)] transition-colors"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setNameError(null); }}
                    disabled={starting}
                    onKeyDown={(e) => { if (e.key === "Enter") submitNameAndStart(); }}
                    className="w-full rounded-[var(--radius-md)] bg-white/5 border border-white/10 px-3 py-2 text-[14px] text-[var(--color-text-primary)] outline-none focus:border-[rgba(255,171,0,0.6)] transition-colors"
                    placeholder="Doe"
                  />
                </div>
                {nameError && (
                  <p className="text-[12px] text-[var(--color-error)]">{nameError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  onClick={() => !starting && setNamePromptOpen(false)}
                  disabled={starting}
                  className="rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitNameAndStart}
                  disabled={starting}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-warning)] hover:bg-[#FFC033] disabled:opacity-60 transition-colors px-4 py-1.5 text-[13px] font-semibold text-white"
                >
                  {starting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      Continue to verification
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
