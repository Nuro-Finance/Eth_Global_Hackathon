"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
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
  ONBOARDING_MODAL_SHELL_CLASS,
} from "@/components/ui/modalPresets";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { SETTINGS_INPUT_CLASS } from "@/features/dashboard/settings/settingsStyles";
import { cn } from "@/lib/utils";
import type { AccountOnboardingStep } from "../types";

const STEP_ORDER: AccountOnboardingStep[] = ["welcome", "team"];

/** Planned full flow length — progress bar only (ENS, theme, etc. later). */
const PLANNED_STEP_COUNT = 5;

const ONBOARDING_INPUT_CLASS = cn(
  SETTINGS_INPUT_CLASS,
  "!border-transparent focus:!border-white/20 focus-visible:!border-white/20",
  "focus:ring-0 focus-visible:ring-0",
);

const ONBOARDING_COPY_CLASS = "whitespace-nowrap";

export interface AccountOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountOnboardingModal({ open, onOpenChange }: AccountOnboardingModalProps) {
  const [step, setStep] = useState<AccountOnboardingStep>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");

  useEffect(() => {
    if (open) return;
    setStep("welcome");
    setDisplayName("");
    setTeamName("");
  }, [open]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const progressPct = ((stepIndex + 1) / PLANNED_STEP_COUNT) * 100;

  const canContinue = useMemo(() => {
    if (step === "welcome") return displayName.trim().length >= 2;
    if (step === "team") return teamName.trim().length >= 2;
    return false;
  }, [step, displayName, teamName]);

  const goBack = () => {
    if (step === "team") setStep("welcome");
  };

  const goNext = () => {
    if (step === "welcome") {
      setStep("team");
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        hideOverlay
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
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4 sm:px-8">
            <Image
              src="/nuro-logo-black.svg"
              alt="Nuro"
              width={88}
              height={24}
              className="h-6 w-auto dark:invert"
              priority
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
            {step === "welcome" ? (
              <div className="mx-auto w-full max-w-md">
                <div className="flex flex-col items-center gap-5 text-center">
                  <DialogTitle className="text-[22px] font-normal leading-snug text-[var(--color-text-primary)] sm:text-[26px]">
                    Welcome to Nuro. What&apos;s your name?
                  </DialogTitle>
                  <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                    This is how you&apos;ll appear across your dashboard.
                  </p>
                </div>
                <div className="mx-auto mt-10 w-full max-w-xs">
                  <Input
                    placeholder="Your Name"
                    className={ONBOARDING_INPUT_CLASS}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {step === "team" ? (
              <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
                <DialogTitle
                  className={cn(
                    ONBOARDING_COPY_CLASS,
                    "text-[22px] font-normal leading-none text-[var(--color-text-primary)] sm:text-[26px]",
                  )}
                >
                  What&apos;s your team or business called?
                </DialogTitle>
                <p
                  className={cn(
                    ONBOARDING_COPY_CLASS,
                    "mt-3 text-sm leading-none text-[var(--color-text-muted)]",
                  )}
                >
                  Used for your workspace and ENS business identity later in setup.
                </p>
                <div className="mt-8 w-full">
                  <Input
                    label="Team name"
                    placeholder="Bob's Burgers"
                    className={ONBOARDING_INPUT_CLASS}
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-4 sm:px-8">
            <Button
              type="button"
              variant="ghost"
              className="text-[var(--color-primary)] hover:bg-white/[0.04]"
              disabled={step === "welcome"}
              onClick={goBack}
            >
              ← Back
            </Button>
            <Button
              type="button"
              className={cn(FORM_MODAL_SUBMIT_BUTTON_CLASS, "min-h-9 px-5 text-sm")}
              disabled={!canContinue}
              onClick={goNext}
            >
              {step === "team" ? "Finish preview" : "Continue"}
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
