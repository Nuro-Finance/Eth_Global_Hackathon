"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Check, CircleHelp, User, Wallet, X } from "lucide-react";
import type { Country } from "react-phone-number-input";
import {
  Dialog,
  DialogClose,
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
import { normalizeEnsSlug } from "@/lib/ens/slug";
import { DESIGN_MODE } from "@/config/design-mode";

/** Planned full flow length — progress bar only (ENS, wallet, theme later). */
const PLANNED_STEP_COUNT = 6;

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
}

export function AccountOnboardingModal({ open, onOpenChange }: AccountOnboardingModalProps) {
  const [step, setStep] = useState<AccountOnboardingStep>("accountType");
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [ensSlug, setEnsSlug] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);
  const [themeChoice, setThemeChoice] = useState<OnboardingTheme | null>(null);
  const [country, setCountry] = useState<Country | undefined>("US");

  const { availability: ensCheckAvailability, availabilityError: ensCheckError } =
    useEnsNameAvailability(ensSlug);

  useEffect(() => {
    if (!open) return;
    setStep("accountType");
    setAccountType(null);
    setDisplayName("");
    setTeamName("");
    setEnsSlug("");
    setWalletConnected(false);
    setThemeChoice(null);
    setCountry("US");
  }, [open]);

  const progressStep = useMemo(() => {
    if (step === "accountType") return 1;
    if (step === "welcome") return 2;
    if (step === "ens") return 4;
    if (step === "wallet") return 5;
    if (step === "theme") return 6;
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
    if (step === "theme") return themeChoice !== null;
    return false;
  }, [step, accountType, displayName, teamName, country, ensSlug, ensCheckAvailability, walletConnected, themeChoice]);

  const showSkip = step === "wallet";
  const reserveSkipSlot = step === "wallet" || step === "theme";

  const goBack = () => {
    if (step === "theme") setStep("wallet");
    else if (step === "wallet") setStep("ens");
    else if (step === "ens") setStep("welcome");
    else if (step === "welcome") setStep("accountType");
  };

  const canGoBack = step !== "accountType";

  const goNext = () => {
    if (step === "accountType") {
      setStep("welcome");
      return;
    }
    if (step === "welcome") {
      if (!ensSlug.trim()) {
        setEnsSlug(normalizeEnsSlug(displayName));
      }
      setStep("ens");
      return;
    }
    if (step === "ens") {
      setStep("wallet");
      return;
    }
    if (step === "wallet") {
      setStep("theme");
      return;
    }
    if (step === "theme") {
      onOpenChange(false);
      return;
    }
    if (step === "team") {
      onOpenChange(false);
      return;
    }
    onOpenChange(false);
  };

  const goSkip = () => {
    if (step !== "wallet") return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setStep("theme");
  };

  const isLastStep = step === "theme";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={ONBOARDING_MODAL_OVERLAY_CLASS}
        className={ONBOARDING_MODAL_SHELL_CLASS}
        style={COMPACT_GLASS_SHELL_OUTER_STYLE}
      >
        <div
          className={ONBOARDING_MODAL_INNER_CLASS}
          style={{
            ...COMPACT_GLASS_SHELL_INNER_STYLE,
            backgroundColor: "var(--color-bg-picker-panel)",
          }}
        >
          <header className="flex shrink-0 items-center justify-between gap-4 px-6 py-4 sm:px-8">
            <img
              src="/Nuro Horizontal Logo.svg"
              alt="Nuro Finance"
              className="h-6 w-auto"
            />
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.08] sm:w-36">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                    "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                    "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                  )}
                  aria-label="Close"
                >
                  <X className="h-full w-full" strokeWidth={2} />
                </button>
              </DialogClose>
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
                    <span className="font-semibold text-[var(--color-primary)]">Welcome to Nuro.</span>{" "}
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
                      Choose your ETH username.
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
                    <span className="inline font-semibold text-[var(--color-primary)]">
                      Connect your wallet.
                    </span>
                    <br />
                    <span className="inline font-normal text-[var(--color-text-primary)]">
                      Nuro is a web3 app
                    </span>
                  </DialogTitle>
                </motion.div>

                <motion.div className="mt-10" variants={walletModalItemCascadeVariants}>
                  <Button
                    type="button"
                    className={cn(
                      FORM_MODAL_SUBMIT_BUTTON_CLASS,
                      "h-16 w-full gap-3 rounded-2xl text-lg font-semibold",
                    )}
                    onClick={() => {
                      if (DESIGN_MODE) setWalletConnected(true);
                    }}
                  >
                    <Wallet className="size-6" strokeWidth={2} />
                    Connect Wallet
                  </Button>
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
                {isLastStep ? "Finish" : "Next"}
              </Button>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
