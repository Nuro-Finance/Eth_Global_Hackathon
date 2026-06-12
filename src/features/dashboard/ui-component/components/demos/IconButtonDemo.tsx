"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/icon-button";
import { Bell, Settings, Search, Plus, Heart, Share2 } from "lucide-react";
import DemoCard from "../DemoCard";

export default function IconButtonDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard
      title={t("iconButton.title")}
      description={t("iconButton.description")}
    >
      {/* Variants Section */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("iconButton.variants")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <IconButton variant="default" icon={<Bell className="w-5 h-5" />} />
          <IconButton variant="ghost" icon={<Settings className="w-5 h-5" />} />
          <IconButton variant="outline" icon={<Search className="w-5 h-5" />} />
          <IconButton variant="primary" icon={<Plus className="w-5 h-5" />} />
        </div>
      </div>

      {/* Sizes Section */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("iconButton.sizes")}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton size="sm" icon={<Heart className="w-4 h-4" />} />
          <IconButton size="md" icon={<Heart className="w-5 h-5" />} />
          <IconButton size="lg" icon={<Heart className="w-6 h-6" />} />
        </div>
      </div>

      {/* Rounded Variants */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("iconButton.roundedVariants")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <IconButton rounded="full" icon={<Share2 className="w-5 h-5" />} />
          <IconButton rounded="xl" icon={<Share2 className="w-5 h-5" />} />
          <IconButton rounded="lg" icon={<Share2 className="w-5 h-5" />} />
          <IconButton rounded="md" icon={<Share2 className="w-5 h-5" />} />
        </div>
      </div>
    </DemoCard>
  );
}
