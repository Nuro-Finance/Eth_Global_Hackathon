"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import DemoCard from "../DemoCard";

export default function InputDemo() {
  const t = useTranslations("UIComponent");
  const [inputValue, setInputValue] = useState("");
  const [textareaValue, setTextareaValue] = useState("");

  return (
    <DemoCard title={t("input.title")} description={t("input.description")}>
      {/* Basic Input */}
      <div className="max-w-md">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("input.basicInput")}
        </h4>
        <Input
          label={t("input.textInput")}
          placeholder={t("input.enterSomeText")}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
      </div>

      {/* Input Variants */}
      <div className="max-w-md">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("input.variants")}
        </h4>
        <div className="flex flex-col gap-3">
          <Input variant="default" placeholder={t("input.defaultVariant")} />
          <Input variant="glass" placeholder={t("input.glassVariant")} />
          <Input variant="outlined" placeholder={t("input.outlinedVariant")} />
        </div>
      </div>

      {/* Input Sizes */}
      <div className="max-w-md">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("input.sizes")}
        </h4>
        <div className="flex flex-col gap-3">
          <Input size="sm" placeholder={t("input.smallInput")} />
          <Input size="md" placeholder={t("input.mediumInput")} />
          <Input size="lg" placeholder={t("input.largeInput")} />
        </div>
      </div>

      {/* Input with Error */}
      <div className="max-w-md">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("input.withError")}
        </h4>
        <Input
          label={t("input.email")}
          placeholder={t("input.enterYourEmail")}
          errorMessage={t("input.validEmailError")}
        />
      </div>

      {/* Textarea */}
      <div className="max-w-md">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("input.textarea")}
        </h4>
        <Textarea
          placeholder={t("input.enterYourMessage")}
          value={textareaValue}
          onChange={(e) => setTextareaValue(e.target.value)}
          rows={3}
        />
      </div>
    </DemoCard>
  );
}
