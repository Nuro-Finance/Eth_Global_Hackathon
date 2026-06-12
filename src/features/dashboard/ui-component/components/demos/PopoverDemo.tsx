"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import DemoCard from "../DemoCard";

export default function PopoverDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard title={t("popover.title")} description={t("popover.description")}>
      {/* Basic Popover */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("popover.basicPopover")}
        </h4>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">{t("popover.openPopover")}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none text-[var(--color-text-primary)]">
                  {t("popover.popoverTitle")}
                </h4>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t("popover.basicContent")}
                </p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Popover with Form */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("popover.withForm")}
        </h4>
        <Popover>
          <PopoverTrigger asChild>
            <Button>{t("popover.updateDimensions")}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none text-[var(--color-text-primary)]">
                  {t("popover.dimensions")}
                </h4>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t("popover.setDimensions")}
                </p>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="width">{t("popover.width")}</Label>
                  <Input
                    id="width"
                    defaultValue="100%"
                    className="col-span-2"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="height">{t("popover.height")}</Label>
                  <Input
                    id="height"
                    defaultValue="25px"
                    className="col-span-2"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Alignment Variations */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("popover.alignment")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {t("popover.start")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("popover.alignedToStart")}
              </p>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {t("popover.center")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-48">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("popover.alignedToCenter")}
              </p>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {t("popover.end")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("popover.alignedToEnd")}
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Side Variations */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("popover.sidePlacement")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {t("popover.top")}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-48">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("popover.positionedTop")}
              </p>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {t("popover.bottom")}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" className="w-48">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("popover.positionedBottom")}
              </p>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {t("popover.left")}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" className="w-48">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("popover.positionedLeft")}
              </p>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {t("popover.right")}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-48">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("popover.positionedRight")}
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Rich Content */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("popover.richContent")}
        </h4>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary">{t("popover.userInfo")}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <div className="flex gap-4">
              <Avatar
                src="/assets/images/avatar/person/person.png"
                fallback="JD"
                size="lg"
              />
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
                  {t("popover.johnDoe")}
                </h4>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("popover.johnEmail")}
                </p>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline">
                    {t("popover.profile")}
                  </Button>
                  <Button size="sm">{t("popover.message")}</Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </DemoCard>
  );
}
