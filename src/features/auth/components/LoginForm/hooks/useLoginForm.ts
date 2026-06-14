"use client";

import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, DEFAULT_CREDENTIALS } from "../config";

export interface LoginFormData {
    email: string;
    password: string;
    rememberMe: boolean;
}

export function useLoginForm(options?: { startInForgotMode?: boolean }) {
    const [showPassword, setShowPassword] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(
        options?.startInForgotMode ?? false
    );
    const [isSent, setIsSent] = useState(false);
 /** Safari: avoid Keychain/password UI until user focuses credentials (sign-in only). */
    const [credentialFieldsActivated, setCredentialFieldsActivated] = useState(false);
    const activateCredentialFields = useCallback(() => setCredentialFieldsActivated(true), []);
    const resetCredentialFieldsActivation = useCallback(() => setCredentialFieldsActivated(false), []);
 
    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: DEFAULT_CREDENTIALS,
        mode: "all",
        reValidateMode: "onChange",
    });
 
    const togglePasswordVisibility = () => setShowPassword((prev) => !prev);
    const toggleForgotPassword = () => {
        setIsForgotPassword((prev) => !prev);
        setIsSent(false);
    };
    
    const resetToAuth = () => {
        setIsForgotPassword(false);
        setIsSent(false);
    };
 
    const {
        register,
        handleSubmit,
        watch,
        setError,
        clearErrors,
        formState: { errors, isValid },
    } = form;
 
    return {
        form,
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
        errors,
        isValid,
        register,
        handleSubmit,
        setError,
        clearErrors,
        watch,
    };
}
