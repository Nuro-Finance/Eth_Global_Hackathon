"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { motion } from "framer-motion";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Briefcase, Check, CircleHelp, Copy, LogOut, User, Wallet, X } from "lucide-react";
import type { Country } from "react-phone-number-input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPACT_GLASS_SHELL_INNER_STYLE,
  COMPACT_GLASS_SHELL_OUTER_STYLE,
  FORM_MODAL_SUBMIT_BUTTON_CLASS,
  ONBOARDING_MODAL_INNER_CLASS,
  ONBOARDING_MODAL_OVERLAY_CLASS,
  ONBOARDING_MODAL_SHELL_CLASS,
} from "@/components/ui/modalPresets";
import {
  walletModalFlowLayerVariants,
  walletModalItemCascadeVariants,
} from "@/components/createWalletModalMotion";
import { CountrySelect } from "@/components/country-select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { SETTINGS_INPUT_CLASS } from "@/features/dashboard/settings/settingsStyles";
import { cn } from "@/lib/utils";
import type { AccountOnboardingStep, AccountType, OnboardingTheme } from "../types";
import {
  EnsAvailabilityPanel,
  EnsUsernameField,
  useEnsNameAvailability,
} from "./EnsNameOnboardingStep";
import { normalizeEnsSlug, ensParentDomain } from "@/lib/ens/slug";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import { DESIGN_MODE } from "@/config/design-mode";
import Dropdown from "@/components/dropdown";
import { useRouter } from "@/i18n/navigation";
import { OnboardingConfettiBurst } from "./OnboardingConfettiBurst";
import { clearRequireWalletRelinkClient } from "@/lib/welcome-onboarding";
import {
  createDefaultOnboardingProgress,
  readOnboardingProgress,
  writeOnboardingProgress,
  type OnboardingCompletedStepKey,
  type StoredOnboardingProgress,
} from "@/lib/account-onboarding-progress";
import { useAppSession } from "@/hooks/useAppSession";
import { updateUser } from "@/store/slices/authSlice";
import type { AppDispatch } from "@/store/store";

const ONBOARDING_EXTERNAL_WALLET_LIST = [
  "detected_ethereum_wallets",
  "metamask",
  "coinbase_wallet",
  "wallet_connect",
] as const;

/** Planned full flow length - progress bar only (ENS, wallet, bind, theme later). */
const PLANNED_STEP_COUNT = 8;

const ACCOUNT_TYPE_OPTIONS: {
  id: AccountType;
  title: string;
  description: string;
  icon: typeof User;
}[] = [
  {
    id: "personal",
    title: "Personal Account",
    description: "Ideal for individual users",
    icon: User,
  },
  {
    id: "business",
    title: "Business Account",
    description: "Companies managing teams",
    icon: Briefcase,
  },
];

const ONBOARDING_INPUT_CLASS = cn(
  SETTINGS_INPUT_CLASS,
  "!border-transparent focus:!border-white/20 focus-visible:!border-white/20",
  "focus:ring-0 focus-visible:ring-0",
);

const ONBOARDING_COUNTRY_SELECT_CLASS =
  "[&_button]:!h-11 [&_button]:rounded-[var(--radius-md)] [&_button]:bg-[var(--color-bg-input)] [&_button]:px-3 [&_button]:text-sm [&_button]:!border-transparent [&_button]:focus:!border-white/20 [&_button]:focus-visible:!border-white/20 [&_button]:focus:ring-0 [&_button]:focus-visible:ring-0";

const ONBOARDING_COPY_CLASS = "whitespace-nowrap";

const ONBOARDING_FOOTER_ACTION_CLASS =
  "inline-flex h-9 min-h-9 shrink-0 items-center justify-center rounded-[10px] px-5 text-sm font-medium";

import {
  DarkThemeDashboardPreview,
  LightThemeDashboardPreview,
  THEME_PREVIEW_WIDTH,
} from "./ThemeDashboardPreview";

const THEME_OPTIONS: {
  id: OnboardingTheme;
  title: string;
}[] = [
  { id: "light", title: "Light" },
  { id: "dark", title: "Dark" },
];

function ThemePreviewButton({
  variant,
  title,
  selected,
  onSelect,
}: {
  variant: OnboardingTheme;
  title: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={title}
      onClick={onSelect}
      className="flex shrink-0 flex-col items-center gap-3 border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40"
      style={{ width: THEME_PREVIEW_WIDTH }}
    >
      <div className="relative w-full shrink-0">
        <div
          className={cn(
            "overflow-hidden rounded-2xl",
            selected && "ring-2 ring-[var(--color-primary)]",
          )}
        >
          {variant === "light" ? <LightThemeDashboardPreview /> : <DarkThemeDashboardPreview />}
        </div>
        {selected ? (
          <span
            className="absolute -right-2 -top-2 z-10 flex aspect-square size-5 items-center justify-center rounded-[6px] bg-[var(--color-primary)]"
            aria-hidden
          >
            <Check className="size-3 text-white" strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          "text-sm font-medium",
          selected ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]",
        )}
      >
        {title}
      </span>
    </button>
  );
}

export interface AccountOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  onProgressChange?: () => void;
}

export function AccountOnboardingModal({
  open,
  onOpenChange,
  userId,
  onProgressChange,
}: AccountOnboardingModalProps) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { data: session, update: updateSession } = useAppSession();
  const [step, setStep] = useState<AccountOnboardingStep>("accountType");
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [ensSlug, setEnsSlug] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);
  const [ensWalletBound, setEnsWalletBound] = useState(false);
  const [ensBindSkipped, setEnsBindSkipped] = useState(false);
  const [ensBinding, setEnsBinding] = useState(false);
  const [ensBindError, setEnsBindError] = useState<string | null>(null);
  const pendingEnsBindAdvanceRef = useRef(false);
  const markWalletConnected = useCallback((address: string) => {
    clearRequireWalletRelinkClient();
    setWalletAddress(address);
    setWalletConnected(true);
    pendingEnsBindAdvanceRef.current = true;
  }, []);
  const markWalletDisconnected = useCallback(() => {
    setWalletAddress("");
    setWalletConnected(false);
  }, []);
  const [ensClaimError, setEnsClaimError] = useState<string | null>(null);
  const ensClaimStartedRef = useRef(false);
  const [themeChoice, setThemeChoice] = useState<OnboardingTheme | null>(null);
  const [country, setCountry] = useState<Country | undefined>("US");

  const { availability: ensCheckAvailability, availabilityError: ensCheckError } =
    useEnsNameAvailability(ensSlug);

  /** Block onboarding dismiss briefly after Privy closes (Radix races Privy unmount). */
  const suppressOnboardingCloseRef = useRef(false);
  const explicitCloseRef = useRef(false);
  const privyModalOpenRef = useRef(false);
  const wasOpenRef = useRef(false);

  const buildDraftSnapshot = useCallback(
    () => ({
      accountType,
      displayName,
      teamName,
      ensSlug,
      country,
      themeChoice,
      walletAddress,
      walletConnected,
      ensWalletBound,
      ensBindSkipped,
    }),
    [
      accountType,
      displayName,
      teamName,
      ensSlug,
      country,
      themeChoice,
      walletAddress,
      walletConnected,
      ensWalletBound,
      ensBindSkipped,
    ],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (
        !nextOpen &&
        (privyModalOpenRef.current ||
          document.getElementById("privy-dialog") ||
          suppressOnboardingCloseRef.current)
      ) {
        return;
      }
      if (!nextOpen && step !== "complete" && !explicitCloseRef.current) {
        return;
      }
      if (!nextOpen) {
        explicitCloseRef.current = false;
      }
      if (!nextOpen && userId && step !== "complete") {
        const saved = readOnboardingProgress(userId);
        if (!saved?.completedAt) {
          writeOnboardingProgress(userId, {
            ...(saved ?? createDefaultOnboardingProgress(step)),
            currentStep: step,
            draft: buildDraftSnapshot(),
          });
          onProgressChange?.();
        }
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, userId, step, buildDraftSnapshot, onProgressChange],
  );

  const blockOnboardingOutsideDismiss = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  const handleFocusOutside = useCallback(
    (event: Event & { detail?: { originalEvent?: Event } }) => {
      const original = event.detail?.originalEvent;
      if (
        original instanceof FocusEvent &&
        original.relatedTarget instanceof Node &&
        document.getElementById("privy-dialog")?.contains(original.relatedTarget)
      ) {
        return;
      }
      event.preventDefault();
    },
    [],
  );

  const persistProgress = useCallback(
    (patch: Partial<StoredOnboardingProgress>) => {
      if (!userId) return;
      const existing = readOnboardingProgress(userId) ?? createDefaultOnboardingProgress(step);
      writeOnboardingProgress(userId, {
        ...existing,
        ...patch,
        completedSteps: {
          ...existing.completedSteps,
          ...patch.completedSteps,
        },
        draft: {
          ...existing.draft,
          ...patch.draft,
        },
      });
      onProgressChange?.();
    },
    [userId, step, onProgressChange],
  );

  const markStepComplete = useCallback(
    (completedStep: OnboardingCompletedStepKey) => {
      persistProgress({
        completedSteps: { [completedStep]: true },
        draft: buildDraftSnapshot(),
      });
    },
    [persistProgress, buildDraftSnapshot],
  );

  const persistDisplayName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length < 2) return;

      const accessToken = (session as { accessToken?: string } | null)?.accessToken;
      if (accessToken) {
        try {
          await fetch("/api/users/profile", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ name: trimmed }),
          });
        } catch {
          /* backend may be down — still patch client state */
        }
      }

      dispatch(updateUser({ name: trimmed }));
      try {
        const cached = window.localStorage.getItem("user");
        const merged = { ...(cached ? JSON.parse(cached) : {}), name: trimmed };
        window.localStorage.setItem("user", JSON.stringify(merged));
      } catch {
        /* private mode / quota */
      }

      try {
        window.setTimeout(() => {
          void updateSession?.({ name: trimmed }).catch(() => {});
        }, 0);
      } catch {
        /* session update is best-effort */
      }
    },
    [dispatch, session, updateSession],
  );

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const saved = userId ? readOnboardingProgress(userId) : null;
      if (saved && !saved.completedAt) {
        setStep(saved.currentStep);
        setAccountType(saved.draft.accountType);
        setDisplayName(saved.draft.displayName);
        setTeamName(saved.draft.teamName);
        setEnsSlug(saved.draft.ensSlug);
        setWalletAddress(saved.draft.walletAddress ?? "");
        setWalletConnected(saved.draft.walletConnected ?? false);
        setEnsWalletBound(saved.draft.ensWalletBound ?? false);
        setEnsBindSkipped(saved.draft.ensBindSkipped ?? false);
        setThemeChoice(saved.draft.themeChoice);
        setCountry((saved.draft.country as Country | undefined) ?? "US");
        if (
          saved.currentStep === "wallet" &&
          (saved.draft.walletConnected ?? false) &&
          !(saved.draft.ensBindSkipped ?? false) &&
          !(saved.draft.ensWalletBound ?? false)
        ) {
          setStep("ensBind");
        }
      } else {
        setStep("accountType");
        setAccountType(null);
        setDisplayName("");
        setTeamName("");
        setEnsSlug("");
        setWalletAddress("");
        setWalletConnected(false);
        setEnsWalletBound(false);
        setEnsBindSkipped(false);
        setThemeChoice(null);
        setCountry("US");
      }
      setEnsClaimError(null);
      setEnsBindError(null);
      ensClaimStartedRef.current = false;
    }
    wasOpenRef.current = open;
  }, [open, userId]);

  useEffect(() => {
    if (!pendingEnsBindAdvanceRef.current || step !== "wallet" || !walletConnected || !walletAddress) {
      return;
    }
    pendingEnsBindAdvanceRef.current = false;
    persistProgress({ currentStep: "ensBind", draft: buildDraftSnapshot() });
    setStep("ensBind");
  }, [step, walletConnected, walletAddress, persistProgress, buildDraftSnapshot]);

  useEffect(() => {
    if (step !== "complete" || ensClaimStartedRef.current) return;

    const slug = normalizeEnsSlug(ensSlug);
    if (slug.length < 2) return;

    ensClaimStartedRef.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/ens/claim", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "business",
            slug,
            visibility: "public",
            ...(ensWalletBound && walletAddress ? { address: walletAddress } : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setEnsClaimError(typeof data.error === "string" ? data.error : "Claim failed");
        }
      } catch {
        setEnsClaimError("Claim failed");
      }
    })();
  }, [step, ensSlug, walletAddress, ensWalletBound]);

  const fullEnsName = useMemo(() => {
    const slug = normalizeEnsSlug(ensSlug);
    if (slug.length < 2) return "";
    return `${slug}.${ensParentDomain()}`;
  }, [ensSlug]);

  const progressStep = useMemo(() => {
    if (step === "accountType") return 1;
    if (step === "welcome") return 2;
    if (step === "ens") return 4;
    if (step === "wallet") return 5;
    if (step === "ensBind") return 6;
    if (step === "theme") return 7;
    if (step === "complete") return 8;
    return 1;
  }, [step]);

  const progressPct = (progressStep / PLANNED_STEP_COUNT) * 100;

  const canContinue = useMemo(() => {
    if (step === "accountType") return accountType !== null;
    if (step === "welcome") return displayName.trim().length >= 2 && Boolean(country);
    if (step === "team") return teamName.trim().length >= 2;
    if (step === "ens") {
      return ensCheckAvailability === "available" && normalizeEnsSlug(ensSlug).length >= 2;
    }
    if (step === "wallet") return walletConnected;
    if (step === "ensBind") return walletConnected && Boolean(walletAddress) && !ensBinding;
    if (step === "theme") return themeChoice !== null;
    return false;
  }, [step, accountType, displayName, teamName, country, ensSlug, ensCheckAvailability, walletConnected, walletAddress, ensBinding, themeChoice]);

  const showSkip = step === "wallet" || step === "ensBind";
  const reserveSkipSlot = step === "wallet" || step === "ensBind" || step === "theme";
  const primaryActionLabel = step === "ensBind" ? "Link wallet" : "Next";

  const bindEnsToWallet = useCallback(async (): Promise<boolean> => {
    const slug = normalizeEnsSlug(ensSlug);
    if (slug.length < 2 || !walletAddress) return false;

    setEnsBinding(true);
    setEnsBindError(null);
    try {
      const res = await fetch("/api/ens/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "business",
          slug,
          visibility: "public",
          address: walletAddress,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEnsBindError(typeof data.error === "string" ? data.error : "Could not link wallet");
        return false;
      }
      setEnsWalletBound(true);
      setEnsBindSkipped(false);
      return true;
    } catch {
      setEnsBindError("Could not link wallet");
      return false;
    } finally {
      setEnsBinding(false);
    }
  }, [ensSlug, walletAddress]);

  const goBack = () => {
    let prevStep: AccountOnboardingStep = "accountType";
    if (step === "theme") {
      prevStep = walletConnected && !ensBindSkipped ? "ensBind" : "wallet";
    } else if (step === "ensBind") prevStep = "wallet";
    else if (step === "wallet") prevStep = "ens";
    else if (step === "ens") prevStep = "welcome";
    else if (step === "welcome") prevStep = "accountType";
    else return;

    persistProgress({ currentStep: prevStep, draft: buildDraftSnapshot() });
    setStep(prevStep);
  };

  const canGoBack = step !== "accountType";

  const goNext = () => {
    if (step === "accountType") {
      markStepComplete("accountType");
      persistProgress({ currentStep: "welcome", draft: buildDraftSnapshot() });
      setStep("welcome");
      return;
    }
    if (step === "welcome") {
      void persistDisplayName(displayName);
      if (!ensSlug.trim()) {
        setEnsSlug(normalizeEnsSlug(displayName));
      }
      markStepComplete("welcome");
      persistProgress({ currentStep: "ens", draft: buildDraftSnapshot() });
      setStep("ens");
      return;
    }
    if (step === "ens") {
      markStepComplete("ens");
      persistProgress({ currentStep: "wallet", draft: buildDraftSnapshot() });
      setStep("wallet");
      return;
    }
    if (step === "wallet") {
      markStepComplete("wallet");
      if (walletConnected) {
        persistProgress({ currentStep: "ensBind", draft: buildDraftSnapshot() });
        setStep("ensBind");
      }
      return;
    }
    if (step === "ensBind") {
      void (async () => {
        const linked = await bindEnsToWallet();
        if (!linked) return;
        markStepComplete("ensBind");
        persistProgress({
          currentStep: "theme",
          draft: { ...buildDraftSnapshot(), ensWalletBound: true, ensBindSkipped: false },
        });
        setStep("theme");
      })();
      return;
    }
    if (step === "theme") {
      markStepComplete("theme");
      persistProgress({
        currentStep: "complete",
        draft: buildDraftSnapshot(),
        completedAt: new Date().toISOString(),
      });
      setStep("complete");
      return;
    }
    if (step === "team") {
      onOpenChange(false);
      return;
    }
    onOpenChange(false);
  };

  const goSkip = () => {
    if (step === "wallet") {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      persistProgress({
        currentStep: "theme",
        walletSkipped: true,
        completedSteps: { wallet: true },
        draft: buildDraftSnapshot(),
      });
      onProgressChange?.();
      setStep("theme");
      return;
    }
    if (step !== "ensBind") return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setEnsBindSkipped(true);
    setEnsWalletBound(false);
    markStepComplete("ensBind");
    persistProgress({
      currentStep: "theme",
      draft: { ...buildDraftSnapshot(), ensBindSkipped: true, ensWalletBound: false },
    });
    onProgressChange?.();
    setStep("theme");
  };

  const { privyEnabled } = usePrivyRuntime();

  const finishToDashboard = useCallback(() => {
    onOpenChange(false);
    router.push("/dashboard");
  }, [onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
      {privyEnabled && open && step === "wallet" ? (
        <PrivyWalletLayer
          modalOpenRef={privyModalOpenRef}
          suppressCloseRef={suppressOnboardingCloseRef}
        />
      ) : null}
      <DialogContent
        hideClose
        overlayClassName={ONBOARDING_MODAL_OVERLAY_CLASS}
        className={ONBOARDING_MODAL_SHELL_CLASS}
        style={COMPACT_GLASS_SHELL_OUTER_STYLE}
        onEscapeKeyDown={blockOnboardingOutsideDismiss}
        onPointerDownOutside={blockOnboardingOutsideDismiss}
        onInteractOutside={blockOnboardingOutsideDismiss}
        onFocusOutside={handleFocusOutside}
      >
        <div
          className={ONBOARDING_MODAL_INNER_CLASS}
          style={{
            ...COMPACT_GLASS_SHELL_INNER_STYLE,
            backgroundColor: "var(--color-bg-picker-panel)",
          }}
        >
          {step === "complete" ? <OnboardingConfettiBurst /> : null}
          <header className="relative z-[70] flex shrink-0 items-center justify-between gap-4 px-6 py-4 sm:px-8">
            <img
              src="/Nuro Horizontal Logo.svg"
              alt="Nuro Finance"
              width={120}
              height={24}
              fetchPriority="high"
              decoding="sync"
              className="h-6 w-auto"
            />
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.08] sm:w-36">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <button
                type="button"
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                  "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                  "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                )}
                aria-label="Close"
                onClick={() => {
                  explicitCloseRef.current = true;
                  handleOpenChange(false);
                }}
              >
                <X className="h-full w-full" strokeWidth={2} />
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-8 sm:px-12 sm:py-10">
            <div className="mx-auto flex w-full min-h-[min(420px,50dvh)] flex-col justify-center">
            {step === "accountType" ? (
              <motion.div
                className="mx-auto w-full max-w-3xl"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.p
                  className="-mt-2 text-center text-[22px] font-bold leading-snug text-[var(--color-text-primary)] sm:text-[26px]"
                  variants={walletModalItemCascadeVariants}
                >
                  Welcome to Nuro Finance!
                </motion.p>
                <motion.div
                  className="mt-8 flex flex-col items-center gap-2 text-center"
                  variants={walletModalItemCascadeVariants}
                >
                  <DialogTitle className="text-[22px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    Choose your account type
                  </DialogTitle>
                  <p className={cn(ONBOARDING_COPY_CLASS, "text-sm text-[var(--color-text-muted)]")}>
                    We&apos;ll help tailor your onboarding
                  </p>
                </motion.div>
                <motion.div
                  className="mt-8 flex flex-wrap justify-center gap-4"
                  variants={walletModalItemCascadeVariants}
                >
                  {ACCOUNT_TYPE_OPTIONS.map(({ id, title, description, icon: Icon }) => {
                    const selected = accountType === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setAccountType(id)}
                        className={cn(
                          "box-border flex w-[240px] shrink-0 flex-col overflow-hidden rounded-2xl bg-white/[0.02] text-left transition-colors hover:bg-white/[0.04]",
                          selected && "ring-2 ring-inset ring-[var(--color-primary)]/35",
                        )}
                      >
                        <div className="flex items-center justify-center pt-8 pb-5">
                          <div
                            className={cn(
                              "flex h-16 w-16 items-center justify-center rounded-full transition-colors",
                              selected
                                ? "bg-white/[0.03] text-[var(--color-primary)]"
                                : "bg-white/[0.03] text-[var(--color-text-muted)]",
                            )}
                          >
                            <Icon className="h-8 w-8" strokeWidth={1.5} />
                          </div>
                        </div>
                        <div className="px-6 pb-6">
                          <p
                            className={cn(
                              ONBOARDING_COPY_CLASS,
                              "text-sm font-medium",
                              selected
                                ? "text-[var(--color-primary)]"
                                : "text-[var(--color-text-primary)]",
                            )}
                          >
                            {title}
                          </p>
                          <p
                            className={cn(
                              ONBOARDING_COPY_CLASS,
                              "mt-1 text-xs leading-snug text-[var(--color-text-muted)]",
                            )}
                          >
                            {description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              </motion.div>
            ) : null}

            {step === "welcome" ? (
              <motion.div
                className="mx-auto w-full max-w-xl"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.div variants={walletModalItemCascadeVariants}>
                  <DialogTitle className="mx-auto max-w-xl text-center text-[22px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    <span className="font-semibold text-[var(--color-primary)]">Welcome to Nuro</span>{" "}
                    Tell us a bit about
                    <br />
                    {accountType === "business" ? "your business" : "yourself"} and we&apos;ll set things up
                  </DialogTitle>
                </motion.div>

                <div className="mx-auto mt-10 max-w-sm space-y-8">
                  <motion.div variants={walletModalItemCascadeVariants}>
                    <label
                      htmlFor="onboarding-name"
                      className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                    >
                      {accountType === "business" ? "Business name" : "Your name"}
                    </label>
                    <div className="relative w-full">
                      <Input
                        id="onboarding-name"
                        placeholder={accountType === "business" ? "Acme Inc." : "Your Name"}
                        className={ONBOARDING_INPUT_CLASS}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                      />
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
                  </motion.div>

                  <motion.div variants={walletModalItemCascadeVariants}>
                    <div className="mb-2 flex items-center gap-1.5">
                      <label
                        htmlFor="onboarding-country"
                        className="text-sm font-medium text-[var(--color-text-secondary)]"
                      >
                        {accountType === "business" ? "Business location" : "Location"}
                      </label>
                      {accountType === "business" ? (
                        <CircleHelp
                          className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <CountrySelect
                      value={country}
                      onChange={setCountry}
                      placeholder="Select country"
                      className={cn("backdrop-blur-none", ONBOARDING_COUNTRY_SELECT_CLASS)}
                    />
                  </motion.div>
                </div>
              </motion.div>
            ) : null}

            {step === "ens" ? (
              <motion.div
                className="relative mx-auto w-full max-w-xl"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.div
                  className="absolute bottom-[calc(100%+1rem)] left-1/2 flex -translate-x-1/2 flex-col items-center"
                  variants={walletModalItemCascadeVariants}
                >
                  <img
                    src="/ens-logo-Blue.svg"
                    alt="ENS"
                    className="h-10 w-auto brightness-0 invert sm:h-11"
                  />
                </motion.div>
                <motion.div variants={walletModalItemCascadeVariants}>
                  <DialogTitle className="mx-auto max-w-xl text-center text-[22px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    <span className="inline font-semibold text-[var(--color-primary)]">
                      Choose your ETH username
                    </span>
                    <br />
                    <span className="inline font-normal text-[var(--color-text-primary)]">
                      You can use this for easy deposits.
                    </span>
                  </DialogTitle>
                </motion.div>

                <motion.div
                  className="mx-auto mt-10 max-w-sm space-y-8"
                  variants={walletModalItemCascadeVariants}
                >
                  <div>
                    <EnsUsernameField slug={ensSlug} onSlugChange={setEnsSlug} />
                    <EnsAvailabilityPanel
                      slug={ensSlug}
                      availability={ensCheckAvailability}
                      availabilityError={ensCheckError}
                    />
                  </div>
                </motion.div>
              </motion.div>
            ) : null}

            {step === "wallet" ? (
              <motion.div
                className="mx-auto w-fit max-w-xl"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.div variants={walletModalItemCascadeVariants}>
                  <DialogTitle className="text-center text-[22px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    {walletConnected ? (
                      <>
                        <span className="inline font-semibold text-[var(--color-primary)]">
                          Wallet Connected
                        </span>
                        <br />
                        <span className="inline font-normal text-[var(--color-text-primary)]">
                          You&apos;re good to go
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="inline font-semibold text-[var(--color-primary)]">
                          Connect your wallet
                        </span>
                        <br />
                        <span className="inline font-normal text-[var(--color-text-primary)]">
                          Nuro is a web3 app
                        </span>
                      </>
                    )}
                  </DialogTitle>
                </motion.div>

                <motion.div className="mt-10" variants={walletModalItemCascadeVariants}>
                  <OnboardingWalletConnectButton
                    onConnected={markWalletConnected}
                    onDisconnected={markWalletDisconnected}
                  />
                </motion.div>
              </motion.div>
            ) : null}

            {step === "ensBind" ? (
              <motion.div
                className="mx-auto w-full max-w-xl"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.div variants={walletModalItemCascadeVariants}>
                  <DialogTitle className="text-center text-[22px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    <span className="inline font-semibold text-[var(--color-text-primary)]">
                      Link wallet to your ENS name
                    </span>
                  </DialogTitle>
                  <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
                    You can change this later in settings
                  </p>
                </motion.div>

                <motion.div
                  className="mx-auto mt-10 flex max-w-md flex-col items-center gap-6"
                  variants={walletModalItemCascadeVariants}
                >
                  <div className="flex w-full flex-col items-center gap-2 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      Your ENS name
                    </p>
                    <p className="break-all text-[28px] font-semibold leading-tight text-[var(--color-primary)] sm:text-[32px]">
                      {fullEnsName}
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <div className="relative inline-flex">
                      <div
                        className={cn(
                          ONBOARDING_INPUT_CLASS,
                          "inline-flex h-11 w-fit max-w-full items-center px-3 font-mono text-sm whitespace-nowrap text-[var(--color-text-primary)]",
                        )}
                      >
                        {walletAddress}
                      </div>
                      <span
                        className="absolute -right-2 -top-2 z-10 flex aspect-square size-5 items-center justify-center rounded-[6px] bg-[var(--color-success)]"
                        aria-label="Connected"
                      >
                        <Check className="size-3 text-white" strokeWidth={2.5} />
                      </span>
                    </div>

                    <p className="max-w-sm text-center text-sm leading-relaxed text-[var(--color-text-muted)]">
                      Linking points your ENS name at the connected wallet
                      <br />
                      so anyone can send funds to{" "}
                      <span className="text-[var(--color-text-secondary)]">{fullEnsName}</span>.
                    </p>
                  </div>

                  {ensBindError ? (
                    <p className="text-sm text-[var(--color-danger)]">{ensBindError}</p>
                  ) : null}
                </motion.div>
              </motion.div>
            ) : null}

            {step === "theme" ? (
              <motion.div
                className="mx-auto w-full max-w-3xl"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.div
                  className="flex flex-col items-center gap-2 text-center"
                  variants={walletModalItemCascadeVariants}
                >
                  <DialogTitle className="text-[22px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    <span className="font-semibold text-[var(--color-primary)]">Choose your theme</span>
                  </DialogTitle>
                  <p className={cn(ONBOARDING_COPY_CLASS, "text-sm text-[var(--color-text-muted)]")}>
                    You can change this later
                  </p>
                </motion.div>
                <motion.div
                  className="mt-8 flex flex-wrap justify-center gap-8"
                  variants={walletModalItemCascadeVariants}
                >
                  {THEME_OPTIONS.map(({ id, title }) => (
                    <ThemePreviewButton
                      key={id}
                      variant={id}
                      title={title}
                      selected={themeChoice === id}
                      onSelect={() => setThemeChoice(id)}
                    />
                  ))}
                </motion.div>
              </motion.div>
            ) : null}

            {step === "complete" ? (
              <motion.div
                className="mx-auto flex w-full max-w-md flex-col items-center text-center"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.div
                  className="relative z-[70] flex flex-col items-center"
                  variants={walletModalItemCascadeVariants}
                >
                  <div className="flex items-center justify-center gap-3">
                    <img
                      src="/nuro-logo-black.svg"
                      alt=""
                      aria-hidden
                      width={48}
                      height={48}
                      fetchPriority="high"
                      decoding="sync"
                      className="h-12 w-12 shrink-0 rounded-[12px] bg-white p-2"
                    />
                    <img
                      src="/card-svg/nuro-word-mark.svg"
                      alt="nuro"
                      width={80}
                      height={24}
                      fetchPriority="high"
                      decoding="sync"
                      className="h-6 w-auto shrink-0 brightness-0 invert"
                    />
                  </div>
                  <DialogTitle className="mt-8 text-[22px] font-semibold leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    Welcome to Nuro Finance
                  </DialogTitle>
                  {ensClaimError ? (
                    <p className="mt-4 text-sm text-[var(--color-danger)]">{ensClaimError}</p>
                  ) : null}
                  <Button
                    type="button"
                    className={cn(
                      FORM_MODAL_SUBMIT_BUTTON_CLASS,
                      "mt-10 h-11 min-w-[10rem] px-8 text-sm font-semibold",
                    )}
                    onClick={finishToDashboard}
                  >
                    Continue
                  </Button>
                </motion.div>
              </motion.div>
            ) : null}

            {step === "team" ? (
              <motion.div
                className="mx-auto flex w-full max-w-md flex-col items-center text-center"
                variants={walletModalFlowLayerVariants}
                initial="initial"
                animate="animate"
              >
                <motion.div variants={walletModalItemCascadeVariants}>
                  <DialogTitle
                    className={cn(
                      ONBOARDING_COPY_CLASS,
                      "text-[22px] font-normal leading-none text-[var(--color-text-primary)] sm:text-[26px]",
                    )}
                  >
                    What&apos;s your team or business called?
                  </DialogTitle>
                </motion.div>
                <motion.p
                  className={cn(
                    ONBOARDING_COPY_CLASS,
                    "mt-3 text-sm leading-none text-[var(--color-text-muted)]",
                  )}
                  variants={walletModalItemCascadeVariants}
                >
                  Used for your workspace and ENS business identity later in setup.
                </motion.p>
                <motion.div className="mt-8 w-full" variants={walletModalItemCascadeVariants}>
                  <Input
                    label="Team name"
                    placeholder="Bob's Burgers"
                    className={ONBOARDING_INPUT_CLASS}
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </motion.div>
              </motion.div>
            ) : null}

            </div>
          </div>

          {step !== "complete" ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 px-6 py-4 sm:px-8">
            {canGoBack ? (
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-none hover:bg-white/[0.04] focus-visible:outline-none active:bg-transparent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={goBack}
              >
                ← Back
              </button>
            ) : (
              <span
                className="inline-flex h-9 shrink-0 items-center px-4 py-2 text-sm font-medium text-[var(--color-primary)] opacity-40 select-none"
                aria-hidden
              >
                ← Back
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              {reserveSkipSlot ? (
                <button
                  type="button"
                  className={cn(
                    ONBOARDING_FOOTER_ACTION_CLASS,
                    "text-[var(--color-text-muted)] transition-none hover:bg-white/[0.04] hover:text-[var(--color-text-primary)] focus-visible:outline-none active:bg-transparent",
                    !showSkip && "pointer-events-none invisible",
                  )}
                  aria-hidden={!showSkip}
                  tabIndex={showSkip ? 0 : -1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={goSkip}
                >
                  Skip
                </button>
              ) : null}
              <Button
                type="button"
                className={cn(
                  FORM_MODAL_SUBMIT_BUTTON_CLASS,
                  ONBOARDING_FOOTER_ACTION_CLASS,
                  "transition-none",
                )}
                disabled={!canContinue}
                onClick={goNext}
              >
                {primaryActionLabel}
              </Button>
            </div>
          </footer>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrivyWalletLayer({
  modalOpenRef,
  suppressCloseRef,
}: {
  modalOpenRef: React.MutableRefObject<boolean>;
  suppressCloseRef: React.MutableRefObject<boolean>;
}) {
  const { isModalOpen } = usePrivy();
  const prevOpenRef = useRef(isModalOpen);
  modalOpenRef.current = isModalOpen;

  useLayoutEffect(() => {
    if (prevOpenRef.current && !isModalOpen) {
      suppressCloseRef.current = true;
      const timer = window.setTimeout(() => {
        suppressCloseRef.current = false;
      }, 300);
      prevOpenRef.current = isModalOpen;
      return () => window.clearTimeout(timer);
    }
    prevOpenRef.current = isModalOpen;
  }, [isModalOpen, suppressCloseRef]);

  return null;
}

function OnboardingConnectedWalletField({
  address,
  onDisconnect,
}: {
  address: string;
  onDisconnect: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = [
    {
      id: "copy",
      label: "Copy address",
      icon: <Copy className="h-4 w-4" />,
      onClick: () => {
        try {
          void navigator.clipboard.writeText(address);
        } catch {
          // Clipboard may be unavailable.
        }
        setMenuOpen(false);
      },
    },
    {
      id: "disconnect",
      label: "Disconnect",
      icon: <LogOut className="h-4 w-4" />,
      onClick: () => {
        setMenuOpen(false);
        onDisconnect();
      },
      variant: "danger" as const,
    },
  ];

  return (
    <div className="flex flex-col items-center">
      <Dropdown
        modal={false}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        placement="bottom-right"
        variant="userNav"
        userNavPanelWidth="content"
        trigger={
          <button
            type="button"
            aria-label="Wallet address options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="inline-flex text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25 rounded-[var(--radius-md)]"
          >
            <span
              className={cn(
                ONBOARDING_INPUT_CLASS,
                "inline-flex h-11 !w-max items-center px-3 font-mono text-sm whitespace-nowrap",
              )}
            >
              {address}
            </span>
          </button>
        }
        items={menuItems}
      />
      <div className="mt-3 flex items-center justify-center gap-2">
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-success)]"
          aria-hidden
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
        <span className="text-sm text-[var(--color-text-primary)]">Connected</span>
      </div>
    </div>
  );
}

function OnboardingWalletConnectButton({
  onConnected,
  onDisconnected,
}: {
  onConnected: (address: string) => void;
  onDisconnected: () => void;
}) {
  const { privyEnabled } = usePrivyRuntime();
  const [designConnected, setDesignConnected] = useState(false);

  if (DESIGN_MODE && !privyEnabled) {
    if (designConnected) {
      return (
        <OnboardingConnectedWalletField
          address="0x3282a1b4c5d6e7f8901234567890abcdef123b80c"
          onDisconnect={() => {
            setDesignConnected(false);
            onDisconnected();
          }}
        />
      );
    }

    return (
      <Button
        type="button"
        className={cn(
          FORM_MODAL_SUBMIT_BUTTON_CLASS,
          "h-16 w-full gap-3 rounded-2xl text-lg font-semibold",
        )}
        onClick={() => {
          const mockAddress = "0x3282a1b4c5d6e7f8901234567890abcdef123b80c";
          setDesignConnected(true);
          onConnected(mockAddress);
        }}
      >
        <Wallet className="size-6" strokeWidth={2} />
        Connect Wallet
      </Button>
    );
  }

  if (!privyEnabled) {
    return (
      <Button
        type="button"
        disabled
        className={cn(
          FORM_MODAL_SUBMIT_BUTTON_CLASS,
          "h-16 w-full gap-3 rounded-2xl text-lg font-semibold",
        )}
      >
        <Wallet className="size-6" strokeWidth={2} />
        Connect Wallet
      </Button>
    );
  }

  return (
    <OnboardingWalletConnectButtonPrivy
      onConnected={onConnected}
      onDisconnected={onDisconnected}
    />
  );
}

function OnboardingWalletConnectButtonPrivy({
  onConnected,
  onDisconnected,
}: {
  onConnected: (address: string) => void;
  onDisconnected: () => void;
}) {
  const { ready, authenticated, login, logout, linkWallet, user } = usePrivy();
  const { wallets } = useWallets();
  const pendingConnectRef = useRef(false);

  const externalWallet = wallets.find(
    (w) => String((w as { connectorType?: string }).connectorType || "") !== "embedded",
  );
  const externalLinkedWalletAddress =
    (user?.linkedAccounts?.find(
      (a) =>
        (a.type === "wallet" || a.type === "smart_wallet") &&
        "address" in a &&
        "walletClientType" in a &&
        a.walletClientType !== "privy",
    )?.address as string | undefined) || "";

  const address = authenticated
    ? externalWallet?.address ?? externalLinkedWalletAddress ?? ""
    : "";

  useEffect(() => {
    if (address) onConnected(address);
  }, [address, onConnected]);

  const handleDisconnect = useCallback(async () => {
    try {
      await Promise.allSettled(
        wallets.map((wallet) => {
          try {
            return wallet.disconnect();
          } catch {
            return Promise.resolve();
          }
        }),
      );
    } catch {
      // Session may already be cleared.
    }

    try {
      if (authenticated) {
        await logout();
      }
    } catch {
      // Privy rejects with a non-enumerable error object when the session is already gone.
    }

    onDisconnected();
  }, [authenticated, logout, onDisconnected, wallets]);

  const runConnect = useCallback(() => {
    if (!ready) {
      pendingConnectRef.current = true;
      return;
    }
    pendingConnectRef.current = false;

    const walletList = [...ONBOARDING_EXTERNAL_WALLET_LIST];

    if (!authenticated) {
      void login({
        loginMethods: ["wallet"],
        walletList,
      } as Parameters<typeof login>[0]).catch(() => {});
      return;
    }

    linkWallet({
      description: "Connect a wallet to use with your Nuro account.",
      walletList,
    });
  }, [authenticated, linkWallet, login, ready]);

  useEffect(() => {
    if (!ready || !pendingConnectRef.current) return;
    pendingConnectRef.current = false;
    runConnect();
  }, [ready, runConnect]);

  if (address) {
    return (
      <OnboardingConnectedWalletField address={address} onDisconnect={handleDisconnect} />
    );
  }

  return (
    <Button
      type="button"
      className={cn(
        FORM_MODAL_SUBMIT_BUTTON_CLASS,
        "h-16 w-full gap-3 rounded-2xl text-lg font-semibold",
      )}
      onClick={runConnect}
    >
      <Wallet className="size-6" strokeWidth={2} />
      Connect Wallet
    </Button>
  );
}
