"use client";

import { flushSync } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { UseFormRegister, FieldErrors } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LoginFormData } from "../hooks";

interface LoginFormFieldsProps {
  register: UseFormRegister<LoginFormData>;
  errors: FieldErrors<LoginFormData>;
  showPassword: boolean;
  togglePasswordVisibility: () => void;
 /** Keeps Safari password/Keychain UI from opening until user focuses these fields */
  credentialFieldsActivated: boolean;
  onActivateCredentialFields: () => void;
 /** Sign-up uses different autocomplete tokens so Safari doesn’t treat it as a saved login */
  isSignUp?: boolean;
}

export function LoginFormFields({
  register,
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

  const fields = [
    {
      id: "email",
      name: "email" as const,
      type: "email",
      label: t("emailLabel"),
      placeholder: t("emailPlaceholder"),
      hasToggle: false,
      hide: false,
    },
    {
      id: "password",
      name: "password" as const,
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
          {errors[field.name] && !isSent && (
            <span className={cn(
              "absolute right-0 top-0 text-[10px] uppercase tracking-wider font-bold animate-in fade-in slide-in-from-right-1",
              errors[field.name]?.message === "atleast 6 characters" ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
            )}>
              {errors[field.name]?.message as string}
            </span>
          )}
          <div className={field.hasToggle ? "relative" : ""}>
            <Input
              {...register(field.name)}
              type={field.hasToggle && showPassword ? "text" : field.type}
              id={field.id}
              autoComplete={
                credentialFieldsActivated
                  ? field.name === "email"
                    ? isForgotPassword
                      ? "email"
                      : isSignUp
                        ? "email"
                        : "username"
                    : isSignUp
                      ? "new-password"
                      : "current-password"
                  : "off"
              }
              className={field.hasToggle ? "pr-10 backdrop-blur-none transition-none" : "backdrop-blur-none transition-none"}
              placeholder={field.placeholder}
              state={errors[field.name] ? "error" : "default"}
              disabled={isSent || field.hide}
              readOnly={!credentialFieldsActivated && !(isSent || field.hide)}
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
            {field.hasToggle && (
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={togglePasswordVisibility}
                className={cn(
                  "absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8",
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
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
