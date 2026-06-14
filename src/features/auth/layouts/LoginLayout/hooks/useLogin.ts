import { useState, useCallback, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { signIn } from "next-auth/react";
import { completeAppLogout } from "@/lib/completeAppLogout";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/store/store";
import { hydrateFromPrivyUser } from "@/store/slices/authSlice";
import type { LoginFormData } from "../../../components";
import { DESIGN_MODE, isDevDesignLoginBypass } from "@/config/design-mode";
import { isDemoLoginEmail } from "../../../components/DemoCredentialsCard/config";
import { markPendingOnboardingClient, markRequireWalletRelinkClient } from "@/lib/welcome-onboarding";
import {
  DEMO_USER_EMAIL,
  DEMO_USER_FULL_NAME,
  DEMO_USER_ID,
} from "@/config/demo-user";
import { persistAppUser } from "@/lib/persistAppUser";

function shouldBypassApiLogin(data: LoginFormData): boolean {
    if (!isDevDesignLoginBypass()) return false;
    return isDemoLoginEmail(data.email);
}

/**
 * Hook for managing login state and actions
 * Uses NextAuth signIn for real backend auth, syncs Redux for UI state.
 *
 * Day-7 demo-critical (T-3 to capital event):
 * - /api/auth/register now returns 202 { needsVerification, email }.
 * - /api/auth/login also returns 202 { needsVerification, email } when
 * the user has a row but hasn't yet entered their OTP.
 * - Both flows return "NEEDS_VERIFICATION" so the LoginLayout can show
 * the OTP entry step. The caller is expected to handle that string
 * return value (LoginLayout pivots its UI step).
 */
export function useLogin() {
    const router = useRouter();
    const dispatch = useDispatch<AppDispatch>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
 /**
 * Set whenever the BE asks for OTP verification. The LoginLayout reads
 * this to know what to render and which email to address the code to.
 */
    const [pendingVerification, setPendingVerification] = useState<{ email: string; password: string } | null>(null);

 /** Header h2 banner errors decay after 10s so the welcome line returns without a new submit. */
    useEffect(() => {
        if (!error) return;
        const timer = window.setTimeout(() => setError(null), 10_000);
        return () => window.clearTimeout(timer);
    }, [error]);

    const onSubmit = useCallback(async (data: LoginFormData, isSignUp?: boolean) => {
        setIsLoading(true);
        setError(null);
        try {
            if (isSignUp) {
                const regRes = await fetch("/api/auth/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: data.email?.split("@")[0] || "User", email: data.email, password: data.password }),
                });
                const regData = await regRes.json();
                if (regRes.status === 202 && regData.needsVerification) {
                    setPendingVerification({ email: data.email, password: data.password });
                    setIsLoading(false);
                    return "NEEDS_VERIFICATION";
                }
                if (!regRes.ok) {
                  setError(regData.error || "Registration failed");
                  setIsLoading(false);
                  return "REGISTRATION_FAILED";
                }
 // Defensive: if backend ever returns immediate JWT (legacy),
 // fall through to auto-login below.
                const loginResult = await signIn("credentials", { redirect: false, email: data.email, password: data.password });
                if (loginResult?.error) {
                  setError("Registered! Please log in.");
                  setIsLoading(false);
                  return "SUCCESS";
                }
                dispatch(hydrateFromPrivyUser({ id: data.email || "", email: data.email || "", name: data.email?.split("@")[0] || "User", role: "admin" }));
                router.push("/dashboard");
                return "SUCCESS";
            }

 // ── Design / dev demo: skip API preflight (demo@nuro.finance on localhost) ──
            if (shouldBypassApiLogin(data)) {
                await completeAppLogout(dispatch);
                const email = DEMO_USER_EMAIL;
                const result = await signIn("credentials", {
                    redirect: false,
                    email,
                    password: data.password,
                });
                dispatch(hydrateFromPrivyUser({
                    id: DEMO_USER_ID,
                    email: DEMO_USER_EMAIL,
                    name: DEMO_USER_FULL_NAME,
                    role: "admin",
                }));
                persistAppUser({
                    id: DEMO_USER_ID,
                    email: DEMO_USER_EMAIL,
                    name: DEMO_USER_FULL_NAME,
                    role: "admin",
                }, "demo");
                if (result?.error && !DESIGN_MODE) {
                    setError("Design login failed. Check NextAuth is configured.");
                    setIsLoading(false);
                    return "INVALID_CREDENTIALS";
                }
                router.push("/dashboard");
                setIsLoading(false);
                return "SUCCESS";
            }

 // ── Login path: pre-flight against /api/auth/login proxy so we
 // can see needsVerification before involving NextAuth ────────
            const preflight = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: data.email, password: data.password }),
            });
            const preflightData = await preflight.json().catch(() => ({}));
            if (preflight.status === 202 && preflightData.needsVerification) {
                setPendingVerification({ email: data.email, password: data.password });
                setIsLoading(false);
                return "NEEDS_VERIFICATION";
            }
            if (preflight.status === 502) {
                setError(
                    preflightData.error ||
                        "Authentication service unavailable. Start the API with npm run dev:api."
                );
                setIsLoading(false);
                return "AUTH_UNAVAILABLE";
            }
            if (!preflight.ok) {
                setError(preflightData.error || "Invalid credentials");
                setIsLoading(false);
                return "INVALID_CREDENTIALS";
            }

 // Verified - go through NextAuth to mint the session cookie
            const result = await signIn("credentials", {
                redirect: false,
                email: data.email,
                password: data.password,
            });
            if (result?.error) {
                setError("Invalid credentials");
                setIsLoading(false);
                return "INVALID_CREDENTIALS";
            }
 // Sync Redux state for UI components that read from store.
            dispatch(hydrateFromPrivyUser({
                id: data.email,
                email: data.email,
                name: data.email.split("@")[0],
                role: "user",
            }));
            persistAppUser({
                id: data.email,
                email: data.email,
                name: data.email.split("@")[0],
                role: "user",
            });

            router.push("/dashboard");
            setIsLoading(false);
        } catch (err) {
            console.error("Auth failed:", err);
            setError("Authentication failed. Please try again.");
            setIsLoading(false);
        }
    }, [dispatch, router]);

 // ── OTP entry: verify the code, then mint a NextAuth session ─────
    const verifyOtp = useCallback(async (code: string): Promise<"SUCCESS" | "INVALID" | "EXPIRED" | "ERROR"> => {
        if (!pendingVerification) return "ERROR";
        const cleanCode = code.replace(/\D/g, "");
        if (cleanCode.length !== 6) {
            setError("Enter the 6-digit code from your email.");
            return "INVALID";
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: pendingVerification.email, code: cleanCode, purpose: "signup" }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Verification failed.");
                setIsLoading(false);
                return res.status === 400 && /expired/i.test(data.error || "") ? "EXPIRED" : "INVALID";
            }
 // OTP good - mint session from verify-otp JWT (skip redundant /auth/login round-trip)
            const result = await signIn("credentials", {
                redirect: false,
                email: pendingVerification.email,
                password: pendingVerification.password,
                accessToken: data.accessToken,
                verifiedUser: JSON.stringify(data.user),
            });
            if (result?.error) {
                setError("Verified but session creation failed. Please log in.");
                setIsLoading(false);
                return "ERROR";
            }
            dispatch(hydrateFromPrivyUser({
                id: data.user?.id ?? pendingVerification.email,
                email: pendingVerification.email,
                name: data.user?.name ?? pendingVerification.email.split("@")[0],
                role: "user",
            }));
            persistAppUser({
                id: data.user?.id ?? pendingVerification.email,
                email: pendingVerification.email,
                name: data.user?.name ?? pendingVerification.email.split("@")[0],
                role: "user",
            });
            markPendingOnboardingClient();
            markRequireWalletRelinkClient();
            setPendingVerification(null);
            setIsLoading(false);
            router.push("/dashboard");
            return "SUCCESS";
        } catch (err) {
            console.error("Verify failed:", err);
            setError("Verification failed. Please try again.");
            setIsLoading(false);
            return "ERROR";
        }
    }, [dispatch, router, pendingVerification]);

    const resendOtp = useCallback(async (): Promise<boolean> => {
        if (!pendingVerification) return false;
        try {
            await fetch("/api/auth/resend-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: pendingVerification.email, purpose: "signup" }),
            });
            return true;
        } catch {
            return false;
        }
    }, [pendingVerification]);

    const cancelVerification = useCallback(() => {
        setPendingVerification(null);
        setError(null);
    }, []);

    const handleGoogleLogin = useCallback(async () => {
        setIsLoading(true);
        try {
            await signIn("google", { callbackUrl: "/en/dashboard" });
        } catch {
            setError("Google login failed");
            setIsLoading(false);
        }
    }, []);

    const handleAppleLogin = useCallback(() => {
 // This slot is used for Telegram in Chris's UI
        setError("Telegram login coming soon");
    }, []);

    return {
        isLoading,
        error,
        onSubmit,
        handleGoogleLogin,
        handleAppleLogin,
 // Day-7 OTP state - LoginLayout pivots its render when truthy
        pendingVerification,
        verifyOtp,
        resendOtp,
        cancelVerification,
    };
}
