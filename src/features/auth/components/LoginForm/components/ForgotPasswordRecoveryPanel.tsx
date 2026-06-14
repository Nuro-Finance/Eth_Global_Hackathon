"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLoginForm } from "../hooks";
import { LoginFormHeader } from "./LoginFormHeader";
import { LoginFormFields } from "./LoginFormFields";
import { SubmitButton } from "./SubmitButton";
import { RememberMe } from "./RememberMe";

const cardVariants = {
  forgot: { height: 528, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
  success: { height: 528, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
};

const layerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0 },
  },
};

const cascadeVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.33, 1, 0.68, 1] },
  },
};

export interface ForgotPasswordRecoveryPanelProps {
  onDismiss: () => void;
  dismissLabel?: string;
 /** Sent-state CTA label before countdown, e.g. "Back to Sign In" or "Back to settings". */
  sentBackLabel?: string;
  defaultEmail?: string;
 /** When false, renders only the inner auth layers (for LoginForm card shell). */
  includeCardShell?: boolean;
  onSentChange?: (sent: boolean) => void;
}

export function ForgotPasswordRecoveryPanel({
  onDismiss,
  dismissLabel = "Back to Sign In",
  sentBackLabel = "Back to Sign In",
  defaultEmail = "",
  includeCardShell = true,
  onSentChange,
}: ForgotPasswordRecoveryPanelProps) {
  const {
    form,
    register,
    errors,
    showPassword,
    togglePasswordVisibility,
    credentialFieldsActivated,
    activateCredentialFields,
    resetCredentialFieldsActivation,
    isSent,
    setIsSent,
  } = useLoginForm({ startInForgotMode: true });

  const [isSimulatingNetwork, setIsSimulatingNetwork] = React.useState(false);

  React.useEffect(() => {
    resetCredentialFieldsActivation();
    form.reset({
      email: defaultEmail,
      password: "",
      rememberMe: false,
    });
    setIsSent(false);
    setIsSimulatingNetwork(false);
  }, [defaultEmail, form, resetCredentialFieldsActivation, setIsSent]);

  React.useEffect(() => {
    onSentChange?.(isSent);
  }, [isSent, onSentChange]);

  const handleDismiss = React.useCallback(() => {
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    resetCredentialFieldsActivation();
    setIsSent(false);
    setIsSimulatingNetwork(false);
    onDismiss();
  }, [onDismiss, resetCredentialFieldsActivation, setIsSent]);

  const handleSubmitEmail = React.useCallback(async () => {
    setIsSimulatingNetwork(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSent(true);
    setIsSimulatingNetwork(false);
  }, [setIsSent]);

  const inner = (
    <div className="w-full relative">
      <AnimatePresence mode="sync" initial>
        {!isSent ? (
          <motion.div
            key="forgot-form"
            variants={layerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full flex flex-col"
          >
            <motion.div className="relative">
              <div className="invisible pointer-events-none">
                <LoginFormHeader isForgotPassword isSent={false} />
              </div>
              <div className="absolute top-0 left-0 w-full flex flex-col items-center pt-6">
                <motion.div
                  variants={cascadeVariants}
                  className="h-[72px] flex items-center justify-center mb-10"
                >
                  <img
                    src="/New Lock Icon.svg"
                    alt="Reset Password"
                    width={72}
                    height={72}
                    className="object-contain"
                  />
                </motion.div>
                <motion.div
                  variants={cascadeVariants}
                  className="flex flex-col items-center justify-center pb-6"
                >
                  <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3 mt-1">
                    Reset Password
                  </h1>
                  <motion.div className="text-[var(--color-text-muted)] text-sm px-4 leading-relaxed text-center">
                    <span className="block">Enter your email address to</span>
                    <span className="block mt-0.5">receive a recovery link.</span>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmitEmail();
              }}
              className="space-y-4"
              autoComplete={credentialFieldsActivated ? "on" : "off"}
            >
              <motion.div variants={cascadeVariants} className="translate-y-[96px] z-10 relative">
                <LoginFormFields
                  register={register}
                  control={form.control}
                  errors={errors}
                  showPassword={showPassword}
                  togglePasswordVisibility={togglePasswordVisibility}
                  credentialFieldsActivated={credentialFieldsActivated}
                  onActivateCredentialFields={activateCredentialFields}
                  isSignUp={false}
                  isForgotPassword
                  isSent={false}
                />
              </motion.div>

              <div className="invisible pointer-events-none">
                <RememberMe control={form.control} />
              </div>

              <div className="space-y-4 relative z-20">
                <motion.div variants={cascadeVariants}>
                  <SubmitButton
                    isLoading={isSimulatingNetwork}
                    isForgotPassword
                    isValid={!!form.watch("email")}
                  />
                </motion.div>

                <motion.div variants={cascadeVariants} className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="w-full text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors py-2 flex items-center justify-center p-0"
                  >
                    {dismissLabel}
                  </button>
                </motion.div>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="forgot-sent"
            variants={layerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full flex flex-col"
          >
            <motion.div className="relative">
              <motion.div className="invisible pointer-events-none">
                <LoginFormHeader isForgotPassword isSent />
              </motion.div>

              <div className="absolute top-0 left-0 w-full flex flex-col items-center pt-6">
                <motion.div
                  variants={cascadeVariants}
                  className="h-[150px] flex items-center justify-center mb-6"
                >
                  <img
                    src="/Updated Email Icon.svg"
                    alt="Email Icon"
                    className="w-[175px] h-[175px] object-contain"
                  />
                </motion.div>
                <div className="flex flex-col items-center justify-center pb-4 text-center">
                  <motion.h1
                    variants={cascadeVariants}
                    className="text-2xl font-bold text-[var(--color-text-primary)] mb-1 mt-0"
                  >
                    Check your inbox
                  </motion.h1>
                  <motion.div
                    variants={cascadeVariants}
                    className="text-[var(--color-text-muted)] text-sm px-4 leading-relaxed"
                  >
                    We&apos;ve sent a recovery link to your
                    <br />
                    registered email address.
                  </motion.div>
                </div>
              </div>
            </motion.div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDismiss();
              }}
              className="space-y-4"
            >
              <div className="translate-y-[96px] z-10 relative invisible pointer-events-none">
                <LoginFormFields
                  register={register}
                  control={form.control}
                  errors={errors}
                  showPassword={false}
                  togglePasswordVisibility={() => {}}
                  credentialFieldsActivated
                  onActivateCredentialFields={() => {}}
                  isSignUp={false}
                  isForgotPassword
                  isSent
                />
              </div>

              <div className="invisible pointer-events-none">
                <RememberMe control={form.control} />
              </div>

              <div className="space-y-4 relative z-20">
                <motion.div variants={cascadeVariants}>
                  <SubmitButton
                    isLoading={isSimulatingNetwork}
                    isForgotPassword
                    isSent
                    isValid
                    sentBackLabel={sentBackLabel}
                    onCountdownEnd={handleDismiss}
                  />
                </motion.div>

                <div className="flex justify-center text-center">
                  <motion.div
                    variants={cascadeVariants}
                    className="w-full text-sm text-[var(--color-text-muted)] py-2 text-center"
                  >
                    Be sure to check spam
                  </motion.div>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (!includeCardShell) {
    return inner;
  }

  return (
    <motion.div
      variants={cardVariants}
      animate={isSent ? "success" : "forgot"}
      initial={false}
      className="w-full max-w-md"
    >
      <div className="relative rounded-[28px] shadow-none w-full h-full">
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-secondary)] rounded-[28px] p-10 h-full relative overflow-hidden w-full">
          {inner}
        </div>
        <motion.div
          className="absolute inset-0 rounded-[28px] pointer-events-none"
          style={{
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "1px",
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-100%] rounded-full opacity-70"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0%, transparent 75%, var(--color-primary) 88%, var(--color-text-primary) 92%, var(--color-primary) 96%, transparent 100%)",
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
