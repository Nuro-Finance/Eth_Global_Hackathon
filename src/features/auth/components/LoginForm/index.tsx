"use client";

import * as React from "react";
import { DEFAULT_CREDENTIALS } from "./config";
import { useLoginForm, type LoginFormData } from "./hooks";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LoginFormHeader,
  LoginFormFields,
  SubmitButton,
  RememberMe,
  LoginFormFooter,
} from "./components";
import SocialLoginButtons from "../SocialLoginButtons";
import { CheckCircle2 } from "lucide-react";
import { InputOTP } from "@/components/ui/input-otp";

interface LoginFormProps {
  isSignUp?: boolean;
  onSubmit: (data: LoginFormData, isSignUp?: boolean) => void;
  isLoading: boolean;
  error: string | null;
  onGoogleLogin: () => void;
  onAppleLogin: () => void;
  onForgotPasswordChange?: (isForgot: boolean) => void;
  setIsSignUp?: (isSignUp: boolean) => void;
  startInForgotMode?: boolean;
}

// Sub-component for verification countdown display in the footer
const VerificationCountdown = ({ onEnd }: { onEnd: () => void }) => {
  const [count, setCount] = React.useState(5);
  const calledRef = React.useRef(false);

  React.useEffect(() => {
    if (count <= 0) {
      if (!calledRef.current) {
        calledRef.current = true;
        onEnd();
      }
      return;
    }
    const timer = setInterval(() => setCount(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [count, onEnd]);

  return <>Return to Log In ({count}s)</>;
};

export default function LoginForm({
  isSignUp,
  onSubmit,
  isLoading,
  error,
  onGoogleLogin,
  onAppleLogin,
  onForgotPasswordChange,
  setIsSignUp,
  startInForgotMode,
}: LoginFormProps) {
  const {
    form,
    register,
    handleSubmit,
    errors,
    isValid,
    showPassword,
    togglePasswordVisibility,
    isForgotPassword,
    toggleForgotPassword,
    resetToAuth,
    credentialFieldsActivated,
    activateCredentialFields,
    resetCredentialFieldsActivation,
    isSent,
    setIsSent,
    setError,
    clearErrors,
    watch,
  } = useLoginForm({ startInForgotMode });

  const watchedEmail = watch("email");
  const watchedPassword = watch("password");
  const prevCredentialsRef = React.useRef({
    email: watchedEmail,
    password: watchedPassword,
  });

 /** After a failed sign-in, manual INVALID errors block isValid and disable the CTA — clear when the user edits. */
  React.useEffect(() => {
    const prev = prevCredentialsRef.current;
    const credentialsChanged =
      prev.email !== watchedEmail || prev.password !== watchedPassword;
    prevCredentialsRef.current = {
      email: watchedEmail,
      password: watchedPassword,
    };
    if (!credentialsChanged) return;
    const hasServerInvalid =
      errors.email?.message === "INVALID" ||
      errors.password?.message === "INVALID";
    if (hasServerInvalid) {
      clearErrors(["email", "password"]);
    }
  }, [
    watchedEmail,
    watchedPassword,
    clearErrors,
    errors.email?.message,
    errors.password?.message,
  ]);

  const hasInvalidCredentialErrors =
    errors.email?.message === "INVALID" &&
    errors.password?.message === "INVALID";
  const canSubmitSignIn = isValid || hasInvalidCredentialErrors;

  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isVerified, setIsVerified] = React.useState(false);
  const [isSigningUp, setIsSigningUp] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [otpError, setOtpError] = React.useState(false);

 // Clear error ONLY when input is empty
  React.useEffect(() => {
    if (otpCode.length === 0 && otpError) {
      setOtpError(false);
    }
  }, [otpCode, otpError]);

 // Synthetic loading block to simulate network delay on Recovery Link bypass
  const [isSimulatingNetwork, setIsSimulatingNetwork] = React.useState(false);

  React.useEffect(() => {
    if (startInForgotMode) {
      onForgotPasswordChange?.(true);
    }
  }, [startInForgotMode, onForgotPasswordChange]);

 /** Mode switch: wipe browser/previous values & require explicit field taps before autocomplete */
  React.useEffect(() => {
    resetCredentialFieldsActivation();
    form.reset(DEFAULT_CREDENTIALS);
  }, [isSignUp, resetCredentialFieldsActivation, form.reset]);

 // Imperative toggle wrapper to prevent infinite re-render loops with parent
  const handleToggleForgot = React.useCallback(() => {
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    resetCredentialFieldsActivation();
    const nextState = !isForgotPassword;
    setIsSigningUp(false);
    setIsSimulatingNetwork(false);
    toggleForgotPassword();
    onForgotPasswordChange?.(nextState);
  }, [
    isForgotPassword,
    resetCredentialFieldsActivation,
    toggleForgotPassword,
    onForgotPasswordChange,
  ]);

  const handleAfterSuccess = React.useCallback(() => {
 // Navigate to the /en landing page after successful account completion
    window.location.href = "/en";
  }, []);

  const handleResetToAuth = React.useCallback(() => {
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    resetCredentialFieldsActivation();
    resetToAuth();
    setIsVerified(false);
    setIsVerifying(false);
    setIsSigningUp(false);
    setIsSimulatingNetwork(false);
    setOtpCode("");
    setOtpError(false);
    onForgotPasswordChange?.(false);
  }, [resetCredentialFieldsActivation, resetToAuth, onForgotPasswordChange]);

 // High-fidelity height-locking variants to eliminate jitter and flickering
  const cardVariants: any = {
    signin: { height: 572, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
    forgot: { height: 528, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
    success: { height: 528, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } }
  };

  const layerVariants: any = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.4,
        ease: "easeOut",
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
 /** Instant — Safari Keychain popover otherwise lingers over a fading layer */
      transition: { duration: 0 },
    },
  };

  const cascadeVariants: any = {
    initial: { opacity: 0, y: 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.33, 1, 0.68, 1] }
    }
  };

 // We wrap the submission to inject field-level errors if the server fails
 // Stabilized to prevent infinite re-render loops with parent
  const handleSubmission = React.useCallback(async (data: LoginFormData) => {
    if (isForgotPassword) {
      setIsSimulatingNetwork(true);
 // Simulate sending a recovery link
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsSent(true);
      setIsSimulatingNetwork(false);
      return;
    }

    if (isSignUp) {
      setIsSigningUp(true);
      await onSubmit(data, isSignUp);
      await new Promise(resolve => setTimeout(resolve, 700));
      setIsVerifying(true);
      return;
    }

    setIsSimulatingNetwork(true);
    const result = await onSubmit(data, isSignUp) as any;
    if (result === "AUTH_UNAVAILABLE") {
      setIsSimulatingNetwork(false);
      return;
    }
    if (result === "INVALID_CREDENTIALS") {
      setIsSimulatingNetwork(false);
      setError("email", { type: "manual", message: "INVALID" });
      setError("password", { type: "manual", message: "INVALID" });
      return;
    }

    setIsSimulatingNetwork(false);
  }, [isForgotPassword, isSignUp, onSubmit, setIsSent, setError, setIsSimulatingNetwork]);

  const handleVerifyOtp = React.useCallback(async () => {
    setOtpError(false);
    setIsSimulatingNetwork(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    if (otpCode === "000000") {
      setOtpError(true);
      setIsSimulatingNetwork(false);
      return;
    }

    setIsVerified(true);
    setIsVerifying(false);
    setIsSimulatingNetwork(false);
  }, [otpCode]);

  return (
    <div className="grid grid-cols-1 grid-rows-1 w-full max-w-md relative">
      {/* DYNAMIC VISIBLE MODAL: Explicitly controlled height mapping for absolute stability */}
      <motion.div
        variants={cardVariants}
        animate={(isSent || isVerifying || isVerified) ? "success" : isForgotPassword ? "forgot" : "signin"}
        initial={false}
        className="col-start-1 row-start-1 self-start justify-self-stretch w-full"
      >
        <div className="relative rounded-[28px] shadow-none w-full h-full">
          <div
            className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-secondary)] rounded-[28px] p-10 h-full relative overflow-hidden w-full"
          >

            {/* Inner dynamic view toggler */}
            <div className="w-full relative">
              <AnimatePresence mode="sync" initial={true}>

                {/* Layer A: Main Login View */}
                {!isForgotPassword && !isSent && !isVerifying && !isVerified && (
                  <motion.div
                    key="layer-a"
                    variants={layerVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full flex flex-col"
                  >
                    <motion.div variants={cascadeVariants}>
                      <LoginFormHeader isSignUp={isSignUp} bannerError={error} />
                    </motion.div>
                    <form
                      onSubmit={handleSubmit(handleSubmission)}
                      className="space-y-4"
                      autoComplete={credentialFieldsActivated ? "on" : "off"}
                    >
                      <motion.div variants={cascadeVariants}>
                        <LoginFormFields
                          register={register}
                          errors={errors}
                          showPassword={showPassword}
                          togglePasswordVisibility={togglePasswordVisibility}
                          credentialFieldsActivated={credentialFieldsActivated}
                          onActivateCredentialFields={activateCredentialFields}
                          isSignUp={isSignUp}
                          isForgotPassword={false}
                        />
                      </motion.div>

                      <motion.div variants={cascadeVariants}>
                        <RememberMe control={form.control} onForgot={handleToggleForgot} />
                      </motion.div>

                      <div className="space-y-4">
                        <motion.div variants={cascadeVariants}>
                          <SubmitButton
                            isLoading={isSignUp ? isSigningUp : isLoading}
                            isSignUp={isSignUp}
                            isValid={isSignUp ? isValid : canSubmitSignIn}
                            isSent={isSent}
                            onCountdownEnd={handleToggleForgot}
                          />
                        </motion.div>

                        <motion.div variants={cascadeVariants} className="w-full">
                          <SocialLoginButtons
                            onGoogleLogin={onGoogleLogin}
                            onAppleLogin={onAppleLogin}
                            variant="inline"
                            isSignUp={isSignUp}
                          />
                        </motion.div>
                      </div>
                    </form>

                    <motion.div variants={cascadeVariants}>
                      <LoginFormFooter />
                    </motion.div>
                  </motion.div>
                )}

                {/* Layer B: Forgot Password Overlay */}
                {isForgotPassword && !isSent && (
                  <motion.div
                    key="layer-b"
                    variants={layerVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full flex flex-col"
                  >
                    <div className="relative">
                      {/* STRUCTURAL GHOST: Perfectly freezes the exact dimensional height so the button NEVER drifts */}
                      <div className="invisible pointer-events-none">
                        <LoginFormHeader isForgotPassword={true} isSent={false} />
                      </div>

                      {/* ABSOLUTE VISUAL OVERLAY: We can pad and break lines here freely without altering the layout height */}
                      <div className="absolute top-0 left-0 w-full flex flex-col items-center pt-6"> {/* Added significant top padding */}
                        <motion.div variants={cascadeVariants} className="h-[72px] flex items-center justify-center mb-10"> {/* Added significant bottom padding */}
                          <img src="/New Lock Icon.svg" alt="Reset Password" width={72} height={72} className="object-contain" />
                        </motion.div>
                        <motion.div variants={cascadeVariants} className="flex flex-col items-center justify-center pb-6">
                          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3 mt-1">
                            Reset Password
                          </h1>
                          <div className="text-[var(--color-text-muted)] text-sm px-4 leading-relaxed text-center">
                            <span className="block">Enter your email address to</span>
                            <span className="block mt-0.5">receive a recovery link.</span>
                          </div>
                        </motion.div>
                      </div>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSubmission({ email: form.getValues("email"), password: "", rememberMe: false });
                      }}
                      className="space-y-4"
                      autoComplete={credentialFieldsActivated ? "on" : "off"}
                    >
                      {/* VISUAL PUSHDOWN: Drastically translated down to close the gap entirely to the action button */}
                      <motion.div variants={cascadeVariants} className="translate-y-[96px] z-10 relative">
                        <LoginFormFields
                          register={register}
                          errors={errors}
                          showPassword={false}
                          togglePasswordVisibility={() => { }}
                          credentialFieldsActivated={credentialFieldsActivated}
                          onActivateCredentialFields={activateCredentialFields}
                          isSignUp={false}
                          isForgotPassword={true}
                          isSent={false}
                        />
                      </motion.div>

                      {/* Layout Ghost: RememberMe parity */}
                      <div className="invisible pointer-events-none">
                        <RememberMe control={form.control} />
                      </div>

                      <div className="space-y-4 relative z-20">
                        <motion.div variants={cascadeVariants}>
                          <SubmitButton
                            isLoading={isSimulatingNetwork}
                            isForgotPassword={true}
                            isValid={!!form.watch("email")}
                          />
                        </motion.div>

                        <motion.div variants={cascadeVariants} className="flex justify-center">
                          <button
                            type="button"
                            onClick={handleResetToAuth}
                            className="w-full text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors py-2 flex items-center justify-center p-0"
                          >
                            Back to Sign In
                          </button>
                        </motion.div>
                      </div>
                    </form>
                  </motion.div>
                )}

                {/* Layer C/D/E: Shared Success & Verification Overlay (Total Geometric Reuse) */}
                {(isSent || isVerifying || isVerified) && (
                  <motion.div
                    key="layer-shared-success"
                    variants={layerVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full flex flex-col"
                  >
                    <div className="relative">
                      {/* STRUCTURAL GHOST: Perfectly freezes the exact dimensional height so the button NEVER drifts */}
                      <div className="invisible pointer-events-none">
                        <LoginFormHeader isForgotPassword={isForgotPassword} isSent={isSent} isVerifyEmail={isVerifying} />
                      </div>

                      {/* ABSOLUTE VISUAL OVERLAY: CLONED for 1:1 total geometric parity */}
                      {/* LAYER D: DEDICATED VERIFICATION OVERLAY */}
                      {isVerifying && (
                        <div className="absolute top-0 left-0 w-full flex flex-col items-center pt-6">
                          <motion.div variants={cascadeVariants} className="h-[90px] flex items-center justify-center mb-8">
                            <img src="/Updated Email Icon.svg" alt="Email Icon" className="w-[125px] h-[125px] object-contain" />
                          </motion.div>
                          <div className="flex flex-col items-center justify-center pb-4 text-center">
                            <motion.h1 variants={cascadeVariants} className="text-2xl font-bold text-[var(--color-text-primary)] mb-1 mt-0">
                              Verify your email
                            </motion.h1>

                            <motion.div variants={cascadeVariants} className="text-[var(--color-text-muted)] text-sm px-4 leading-relaxed">
                              We sent a 6-digit code to your email.
                            </motion.div>

                            <motion.button
                              variants={cascadeVariants}
                              type="button"
                              onClick={() => {
                                setIsVerifying(false);
                                setIsSigningUp(false);
                              }}
                              className="mt-1 text-[12px] font-medium text-[var(--color-primary)] hover:underline focus:outline-none bg-transparent border-none p-0 shadow-none z-30"
                            >
                              Wrong email?
                            </motion.button>

                            {/* Render live OTP slots during verification state */}
                            <motion.div variants={cascadeVariants} className="mt-14 px-10 relative">
                              {otpError && (
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+4px)] w-full text-center">
                                  <p className="text-[11px] font-bold text-[var(--color-error)] tracking-wider animate-in fade-in slide-in-from-bottom-1">
                                    INVALID
                                  </p>
                                </div>
                              )}
                              <InputOTP
                                value={otpCode}
                                onChange={setOtpCode}
                              />
                            </motion.div>
                          </div>
                        </div>
                      )}

                      {/* LAYER E: DEDICATED VERIFICATION SUCCESS OVERLAY */}
                      {isVerified && (
                        <div className="absolute top-0 left-0 w-full flex flex-col items-center pt-6">
                          <motion.div variants={cascadeVariants} className="h-[150px] flex items-center justify-center mb-6">
                            <img src="/green-check.png" alt="Success" className="w-[120px] h-[120px] object-contain" />
                          </motion.div>
                          <div className="flex flex-col items-center justify-center pb-4 text-center">
                            <motion.h1 variants={cascadeVariants} className="text-2xl font-bold text-[var(--color-text-primary)] mb-1 mt-0">
                              Success!
                            </motion.h1>

                            <motion.div variants={cascadeVariants} className="text-[var(--color-text-muted)] text-sm px-4 leading-relaxed">
                              Your account has been verified.<br />
                              Redirecting you to sign in...
                            </motion.div>
                          </div>
                        </div>
                      )}

                      {/* LAYER C: DEDICATED SUCCESS OVERLAY */}
                      {isSent && !isVerifying && !isVerified && (
                        <div className="absolute top-0 left-0 w-full flex flex-col items-center pt-6">
                          <motion.div variants={cascadeVariants} className="h-[150px] flex items-center justify-center mb-6">
                            <img src="/Updated Email Icon.svg" alt="Email Icon" className="w-[175px] h-[175px] object-contain" />
                          </motion.div>
                          <div className="flex flex-col items-center justify-center pb-4 text-center">
                            <motion.h1 variants={cascadeVariants} className="text-2xl font-bold text-[var(--color-text-primary)] mb-1 mt-0">
                              Check your inbox
                            </motion.h1>

                            <motion.div variants={cascadeVariants} className="text-[var(--color-text-muted)] text-sm px-4 leading-relaxed">
                              We've sent a recovery link to your<br />
                              registered email address.
                            </motion.div>
                          </div>
                        </div>
                      )}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (isVerifying) handleVerifyOtp();
                        else handleResetToAuth();
                      }}
                      className="space-y-4"
                    >
                      {/* VISUAL LAYOUT GHOST: Mimics the exactly translated layout for 1:1 parity */}
                      <div className={cn(
                        "translate-y-[96px] z-10 relative invisible pointer-events-none",
                        isVerifying && "opacity-0" // Hide ghost background but keep space
                      )}>
                        <LoginFormFields
                          register={register}
                          errors={errors}
                          showPassword={false}
                          togglePasswordVisibility={() => { }}
                          credentialFieldsActivated
                          onActivateCredentialFields={() => {}}
                          isSignUp={false}
                          isForgotPassword={true}
                          isSent={true}
                        />
                      </div>

                      {/* Layout Ghost: RememberMe parity */}
                      <div className="invisible pointer-events-none">
                        <RememberMe control={form.control} />
                      </div>

                      <div className="space-y-4 relative z-20">
                        <motion.div variants={cascadeVariants}>
                          <SubmitButton
                            label={isVerified ? "Log In" : isVerifying ? "Verify" : undefined}
                            isLoading={isSimulatingNetwork}
                            isForgotPassword={isForgotPassword}
                            isSent={isSent || isVerified}
                            isValid={isVerifying ? otpCode.length === 6 : true}
                            onClick={isVerifying ? handleVerifyOtp : (isVerified || (isSent && !isVerifying)) ? handleResetToAuth : undefined}
                            onCountdownEnd={(isVerified || (isSent && !isVerifying)) ? handleResetToAuth : undefined}
                          />
                        </motion.div>

                        <div className="flex justify-center text-center">
                          {isVerifying ? (
                            <motion.button
                              variants={cascadeVariants}
                              type="button"
                              onClick={() => {
                                setIsVerifying(false);
                                setIsSigningUp(false);
                              }}
                              className="w-full text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors py-2 flex items-center justify-center p-0"
                            >
                              Back to Sign Up
                            </motion.button>
                          ) : isVerified ? (
                            <motion.div variants={cascadeVariants} className="w-full text-sm text-[var(--color-text-muted)] py-2 text-center">
                              <VerificationCountdown onEnd={handleResetToAuth} />
                            </motion.div>
                          ) : (isSent && !isVerifying) && (
                            <motion.div variants={cascadeVariants} className="w-full text-sm text-[var(--color-text-muted)] py-2 text-center">
                              Be sure to check spam
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* Surgical Comet Overlay (Border-Only Mask) - Moved out to avoid clipping */}
          <div
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
                background: "conic-gradient(from 0deg, transparent 0%, transparent 75%, var(--color-primary) 88%, var(--color-text-primary) 92%, var(--color-primary) 96%, transparent 100%)",
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* Toggle Mode Button (Bottom Right) - Now integrated inside the form's grid to stay perfect 8px below the boundary */}
      {!isForgotPassword && !isSent && !isVerifying && !isVerified && setIsSignUp && (
        <div className="absolute top-[calc(100%+8px)] right-10 z-20">
          <button
            type="button"
            onClick={() => {
              setIsSignUp?.(!isSignUp);
              setIsSigningUp(false);
              setIsSimulatingNetwork(false);
            }}
            className="text-[var(--color-primary)] text-[13px] font-medium hover:underline transition-colors focus:outline-none bg-transparent border-none p-0 shadow-none"
          >
            {isSignUp ? "Sign In" : "Create Account"}
          </button>
        </div>
      )}
    </div>
  );
}

export type { LoginFormData, LoginFormProps };
