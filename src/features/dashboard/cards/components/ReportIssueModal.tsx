"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FORM_MODAL_INNER_CLASS,
  FORM_MODAL_SHELL_CLASS,
  FORM_MODAL_SUBMIT_BUTTON_CLASS,
} from "@/components/ui/modalPresets";
import { cn } from "@/lib/utils";

interface ReportIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardLabel?: string;
}

export function ReportIssueModal({
  open,
  onOpenChange,
  cardLabel,
}: ReportIssueModalProps) {
  const [step, setStep] = useState<"form" | "success">("form");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("form");
      setMessage("");
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSubmitting(false);
    setStep("success");
  };

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        hideClose
        hideOverlay
        className={FORM_MODAL_SHELL_CLASS}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className={FORM_MODAL_INNER_CLASS}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <DialogClose asChild>
            <button
              type="button"
              className={cn(
                "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
              )}
              aria-label="Close"
            >
              <X className="h-full w-full" strokeWidth={2} />
            </button>
          </DialogClose>

          <div className="flex h-full min-h-0 flex-col px-6 pb-6 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
            {step === "form" ? (
              <>
                <div className="flex shrink-0 items-center gap-3 pr-8">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-[var(--color-bg-input)]">
                    <AlertTriangle
                      className="h-[18px] w-[18px] text-[var(--color-warning)]"
                      strokeWidth={2}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle asChild>
                      <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                        Report Issue
                      </h1>
                    </DialogTitle>
                    <DialogDescription asChild>
                      <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-muted)]">
                        Tell us what went wrong.
                      </p>
                    </DialogDescription>
                  </div>
                </div>

                <div className="mt-6 flex min-h-0 flex-1 flex-col">
                  <label
                    htmlFor="report-issue-message"
                    className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-dimmed)]"
                  >
                    Description
                  </label>
                  <Textarea
                    id="report-issue-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe the issue..."
                    className="min-h-0 flex-1 resize-none rounded-[14px] border-0 !border-0 !bg-white/[0.02] !shadow-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:!border-0 focus-visible:!ring-0 dark:!bg-white/[0.02]"
                    disabled={submitting}
                  />
                </div>

                <footer className="mt-6 flex shrink-0 items-center justify-end">
                  <button
                    type="button"
                    disabled={!message.trim() || submitting}
                    onClick={() => void handleSubmit()}
                    className={FORM_MODAL_SUBMIT_BUTTON_CLASS}
                  >
                    {submitting ? "Submitting..." : "Submit Report"}
                  </button>
                </footer>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <div className="flex flex-col items-center gap-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[var(--color-success)]/40 bg-[var(--color-success)]/10">
                    <Check
                      className="h-5 w-5 text-[var(--color-success)]"
                      strokeWidth={2.25}
                    />
                  </div>

                  <DialogTitle asChild>
                    <h1 className="text-[16px] font-medium leading-none text-[var(--color-text-primary)]">
                      Report Submitted
                    </h1>
                  </DialogTitle>

                  <DialogDescription asChild>
                    <div className="max-w-md text-[13px] leading-[1.45] text-[var(--color-text-muted)]">
                      <p>We&apos;ve received your report and will follow up.</p>
                      <p className="mt-1.5">
                        Responses will be sent to your account email.
                      </p>
                    </div>
                  </DialogDescription>

                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 px-4 text-xs font-medium leading-none outline-none",
                      "bg-white/5 text-white hover:bg-white/10",
                    )}
                    onClick={handleClose}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
