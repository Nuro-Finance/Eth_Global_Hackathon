"use client";

import { useController, Control } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { LoginFormData } from "../hooks";

interface RememberMeProps {
  control: Control<LoginFormData>;
  onForgot?: () => void;
}
 
export function RememberMe({ control, onForgot }: RememberMeProps) {
  const t = useTranslations("Login");
  const { field } = useController({ name: "rememberMe", control });

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Checkbox
          id="rememberMe"
          checked={field.value}
          onCheckedChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          className="backdrop-blur-none transition-none"
        />
        <Label htmlFor="rememberMe" className="text-xs cursor-pointer">
          {t("rememberMe")}
        </Label>
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="text-xs px-0 h-auto"
        onClick={onForgot}
      >
        {t("forgotPassword")}
      </Button>
    </div>
  );
}
