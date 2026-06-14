"use client";

import { flushSync } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { UseFormRegister, FieldErrors, Control, Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input, inputVariants } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LoginFormData } from "../hooks";

interface LoginFormFieldsProps {
  register: UseFormRegister<LoginFormData>;
  control: Control<LoginFormData>;
  errors: FieldErrors<LoginFormData>;
  showPassword: boolean;
  togglePasswordVisibility: () => void;
  credentialFieldsActivated: boolean;
  onActivateCredentialFields: () => void;
  isSignUp?: boolean;
}

export function LoginFormFields({
  register,
  control,
  errors,
  showPassword,
  togglePasswordVisibility,
  credentialFieldsActivated,
  onActivateCredentialFields,
  isSignUp = false,
  isForgotPassword,
  isSent,
}: LoginFormFieldsProps & { isForgotPassword?: boolean; isSent?: boolean }) {
  const t = useTranslations("Login");
  const autofillReady = isSignUp || credentialFieldsActivated;
  const passwordRegister = register("password");

  if (isSignUp) {
    return (
      <div className={cn("space-y-4", isSent ? "opacity-0 pointer-events-none" : "opacity-100")}>
        <div className="group relative space-y-2">
          <Label htmlFor="username" className="text-[var(--color-text-muted)] group-focus-within:text-[var(--color-text-primary)]">
            {t("emailLabel")}
          </Label>
          {errors.email && (
            <span className="absolute right-0 top-0 text-[10px] uppercase tracking-wider font-bold text-[var(--color-error)]">
              {errors.email.message as string}
            </span>
          )}
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <input
                id="username"
                name="username"
                type="email"
                inputMode="email"
                autoComplete="username"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                className={cn(
                  inputVariants({
                    variant: "default",
                    size: "md",
                    state: errors.email ? "error" : "default",
                  }),
                  "backdrop-blur-none transition-none"
                )}
                placeholder={t("emailPlaceholder")}
                disabled={isSent}
              />
            )}
          />
        </div>

        <div className="group relative space-y-2">
          <Label htmlFor="new-password" className="text-[var(--color-text-muted)] group-focus-within:text-[var(--color-text-primary)]">
            {t("passwordLabel")}
          </Label>
          {errors.password && (
            <span className={cn(
              "absolute right-0 top-0 text-[10px] uppercase tracking-wider font-bold",
              errors.password.message === "atleast 6 characters" ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
            )}>
              {errors.password.message as string}
            </span>
          )}
          <div className="relative">
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <input
                  id="new-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={showPassword ? "off" : "new-password"}
                  passwordrules="minlength: 6;"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  className={cn(
                    inputVariants({
                      variant: "default",
                      size: "md",
                      state: errors.password ? "error" : "default",
                    }),
                    "pr-10 backdrop-blur-none transition-none"
                  )}
                  placeholder={t("passwordPlaceholder")}
                  disabled={isSent}
                />
              )}
            />
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={togglePasswordVisibility}
              className={cn(
                "absolute right-4 top-1/2 -translate-y-1/2 z-10 h-8 w-8",
                "!bg-transparent hover:bg-white/[0.06] dark:hover:bg-white/[0.08]",
                "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-200"
              )}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              icon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            />
          </div>
        </div>
      </div>
    );
  }

  const fields = [
    {
      id: "email",
      htmlName: "email",
      rhfName: "email" as const,
      type: "email",
      label: t("emailLabel"),
      placeholder: t("emailPlaceholder"),
      hasToggle: false,
      hide: false,
    },
    {
      id: "password",
      htmlName: "password",
      rhfName: "password" as const,
      type: "password",
      label: t("passwordLabel"),
      placeholder: t("passwordPlaceholder"),
      hasToggle: true,
      hide: isForgotPassword,
    },
  ];

  return (
    <div className={cn("space-y-4", isSent ? "opacity-0 pointer-events-none" : "opacity-100")}>
      {fields.map((field) => (
        <div
          key={field.id}
          className={cn(
            "group relative space-y-2",
            field.hide ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
          <Label
            htmlFor={field.id}
            className="text-[var(--color-text-muted)] group-focus-within:text-[var(--color-text-primary)] group-has-[input:focus]:text-[var(--color-text-primary)] group-has-[input:not(:placeholder-shown)]:text-[var(--color-text-primary)]"
          >
            {field.label}
          </Label>
          {errors[field.rhfName] && !isSent && (
            <span className={cn(
              "absolute right-0 top-0 text-[10px] uppercase tracking-wider font-bold animate-in fade-in slide-in-from-right-1",
              errors[field.rhfName]?.message === "atleast 6 characters" ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
            )}>
              {errors[field.rhfName]?.message as string}
            </span>
          )}
          <div className={field.hasToggle ? "relative" : ""}>
            {field.hasToggle ? (
              <>
                <input
                  {...passwordRegister}
                  name={field.htmlName}
                  type={showPassword ? "text" : "password"}
                  id={field.id}
                  autoComplete={
                    autofillReady && !showPassword ? "current-password" : "off"
                  }
                  className={cn(
                    inputVariants({
                      variant: "default",
                      size: "md",
                      state: errors[field.rhfName] ? "error" : "default",
                    }),
                    "pr-10 backdrop-blur-none transition-none"
                  )}
                  placeholder={field.placeholder}
                  disabled={isSent || field.hide}
                  readOnly={!autofillReady && !(isSent || field.hide)}
                  tabIndex={field.hide ? -1 : 0}
                  onChange={(e) => passwordRegister.onChange(e)}
                  onInput={(e) => passwordRegister.onChange(e)}
                  onBlur={passwordRegister.onBlur}
                  onPointerDownCapture={() => {
                    if (credentialFieldsActivated || isSent || field.hide) return;
                    flushSync(() => onActivateCredentialFields());
                  }}
                  onFocus={() => {
                    if (credentialFieldsActivated || isSent || field.hide) return;
                    flushSync(() => onActivateCredentialFields());
                  }}
                />
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!credentialFieldsActivated) onActivateCredentialFields();
                    togglePasswordVisibility();
                  }}
                  className={cn(
                    "absolute right-4 top-1/2 -translate-y-1/2 z-10 h-8 w-8",
                    "!bg-transparent hover:bg-white/[0.06] dark:hover:bg-white/[0.08]",
                    "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-200"
                  )}
                  aria-label={
                    showPassword ? t("hidePassword") : t("showPassword")
                  }
                  tabIndex={field.hide ? -1 : 0}
                  icon={
                    showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )
                  }
                />
              </>
            ) : (
              <Input
                {...register(field.rhfName)}
                type={field.type}
                id={field.id}
                autoComplete={
                  autofillReady
                    ? isForgotPassword
                      ? "email"
                      : "username"
                    : "off"
                }
                className="backdrop-blur-none transition-none"
                placeholder={field.placeholder}
                state={errors[field.rhfName] ? "error" : "default"}
                disabled={isSent || field.hide}
                readOnly={!autofillReady && !(isSent || field.hide)}
                tabIndex={field.hide ? -1 : 0}
                onPointerDownCapture={() => {
                  if (credentialFieldsActivated || isSent || field.hide) return;
                  flushSync(() => onActivateCredentialFields());
                }}
                onFocus={() => {
                  if (credentialFieldsActivated || isSent || field.hide) return;
                  flushSync(() => onActivateCredentialFields());
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
