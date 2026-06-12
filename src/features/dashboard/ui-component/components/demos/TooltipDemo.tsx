"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Info, Settings, Trash2, Heart } from "lucide-react";
import DemoCard from "../DemoCard";

export default function TooltipDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard title={t("tooltip.title")} description={t("tooltip.description")}>
      <TooltipProvider>
        {/* Basic Tooltip */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
            {t("tooltip.basicTooltip")}
          </h4>
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">{t("tooltip.hoverMe")}</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltip.thisIsTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Side Placement */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
            {t("tooltip.sidePlacement")}
          </h4>
          <div className="flex flex-wrap items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("tooltip.top")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{t("tooltip.tooltipTop")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("tooltip.bottom")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{t("tooltip.tooltipBottom")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("tooltip.left")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{t("tooltip.tooltipLeft")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("tooltip.right")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t("tooltip.tooltipRight")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* With Icons */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
            {t("tooltip.onIconButtons")}
          </h4>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  icon={<Info className="w-5 h-5" />}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltip.moreInformation")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  icon={<Settings className="w-5 h-5" />}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltip.settings")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  icon={<Heart className="w-5 h-5" />}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltip.addToFavorites")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="outline"
                  icon={<Trash2 className="w-5 h-5 text-[var(--color-error)]" />}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltip.deleteItem")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Rich Content */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
            {t("tooltip.richContent")}
          </h4>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button>{t("tooltip.keyboardShortcut")}</Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              <span>{t("tooltip.saveFile")}</span>
              <kbd className="px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]">
                Ctrl+S
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Delayed Tooltip */}
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
            {t("tooltip.withDelay")}
          </h4>
          <div className="flex items-center gap-4">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("tooltip.noDelay")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltip.instantTooltip")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("tooltip.delay500ms")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltip.delayedTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </DemoCard>
  );
}
