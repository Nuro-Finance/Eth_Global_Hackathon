"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Plus, Trash, Edit, Download } from "lucide-react";
import DemoCard from "../DemoCard";

export default function ButtonDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard title={t("button.title")} description={t("button.description")}>
      {/* Variants Section */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.variants")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <Button variant="default">{t("button.default")}</Button>
          <Button variant="destructive">{t("button.destructive")}</Button>
          <Button variant="outline">{t("button.outline")}</Button>
          <Button variant="secondary">{t("button.secondary")}</Button>
          <Button variant="ghost">{t("button.ghost")}</Button>
          <Button variant="link">{t("button.link")}</Button>
        </div>
      </div>

      {/* Sizes Section */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.sizes")}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{t("button.small")}</Button>
          <Button size="default">{t("button.default")}</Button>
          <Button size="lg">{t("button.large")}</Button>
        </div>
      </div>

      {/* With Icons Section */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.withIcons")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <Button icon={<Plus className="w-4 h-4" />}>
            {t("button.createNew")}
          </Button>
          <Button variant="destructive" icon={<Trash className="w-4 h-4" />}>
            {t("button.delete")}
          </Button>
          <Button variant="outline" icon={<Edit className="w-4 h-4" />}>
            {t("button.edit")}
          </Button>
          <Button
            variant="secondary"
            icon={<Download className="w-4 h-4" />}
            iconPosition="right"
          >
            {t("button.download")}
          </Button>
        </div>
      </div>

      {/* States Section */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.states")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <Button disabled>{t("common.disabled")}</Button>
          <Button variant="outline" disabled>
            {t("button.disabledOutline")}
          </Button>
        </div>
      </div>
    </DemoCard>
  );
}
