"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  FolderOpen,
  Image,
  Music,
  Video,
} from "lucide-react";
import DemoCard from "../DemoCard";

export default function SheetDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard title={t("sheet.title")} description={t("sheet.description")}>
      {/* Sheet from Right */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("sheet.fromRight")}
        </h4>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{t("sheet.openRightSheet")}</Button>
          </SheetTrigger>
          <SheetContent className="bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]">
            <SheetHeader>
              <SheetTitle className="text-[var(--color-text-primary)]">
                {t("sheet.editProfile")}
              </SheetTitle>
              <SheetDescription className="text-[var(--color-text-muted)]">
                {t("sheet.editProfileDescription")}
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 p-5">
              <div className="grid gap-2">
                <Label htmlFor="r-name">{t("sheet.name")}</Label>
                <Input id="r-name" defaultValue="John Doe" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-email">{t("sheet.email")}</Label>
                <Input
                  id="r-email"
                  type="email"
                  defaultValue="john@example.com"
                />
              </div>
            </div>
            <SheetFooter>
              <SheetClose asChild>
                <Button type="submit">{t("sheet.saveChanges")}</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Sheet from Left */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("sheet.fromLeft")}
        </h4>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{t("sheet.openLeftSheet")}</Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]"
          >
            <SheetHeader>
              <SheetTitle className="text-[var(--color-text-primary)]">
                {t("sheet.navigation")}
              </SheetTitle>
              <SheetDescription className="text-[var(--color-text-muted)]">
                {t("sheet.navigationDescription")}
              </SheetDescription>
            </SheetHeader>
            <div className="p-4">
              <nav className="flex flex-col gap-2">
                <Button variant="ghost" className="justify-start gap-3">
                  <LayoutDashboard className="h-4 w-4" /> {t("sheet.dashboard")}
                </Button>
                <Button variant="ghost" className="justify-start gap-3">
                  <FolderKanban className="h-4 w-4" /> {t("sheet.projects")}
                </Button>
                <Button variant="ghost" className="justify-start gap-3">
                  <Users className="h-4 w-4" /> {t("sheet.team")}
                </Button>
                <Button variant="ghost" className="justify-start gap-3">
                  <Settings className="h-4 w-4" /> {t("sheet.settings")}
                </Button>
              </nav>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Sheet from Top */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("sheet.fromTop")}
        </h4>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{t("sheet.openTopSheet")}</Button>
          </SheetTrigger>
          <SheetContent
            side="top"
            className="h-auto bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]"
          >
            <SheetHeader>
              <SheetTitle className="text-[var(--color-text-primary)]">
                {t("sheet.notifications")}
              </SheetTitle>
              <SheetDescription className="text-[var(--color-text-muted)]">
                {t("sheet.unreadNotifications")}
              </SheetDescription>
            </SheetHeader>
            <div className="p-4 flex gap-3">
              <div className="flex-1 p-3 rounded-lg bg-[var(--color-bg-tertiary)]">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {t("sheet.newMessage")}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("sheet.twoMinutesAgo")}
                </p>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-[var(--color-bg-tertiary)]">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {t("sheet.updateAvailable")}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("sheet.oneHourAgo")}
                </p>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-[var(--color-bg-tertiary)]">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {t("sheet.taskCompleted")}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("sheet.threeHoursAgo")}
                </p>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Sheet from Bottom */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("sheet.fromBottom")}
        </h4>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{t("sheet.openBottomSheet")}</Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="h-auto bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]"
          >
            <SheetHeader>
              <SheetTitle className="text-[var(--color-text-primary)]">
                {t("sheet.quickActions")}
              </SheetTitle>
              <SheetDescription className="text-[var(--color-text-muted)]">
                {t("sheet.chooseAction")}
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-4 gap-4 p-4">
              <Button
                variant="ghost"
                className="flex flex-col items-center gap-2 h-auto py-4"
              >
                <FolderOpen className="h-6 w-6 text-[var(--color-primary)]" />
                <span className="text-xs">{t("sheet.files")}</span>
              </Button>
              <Button
                variant="ghost"
                className="flex flex-col items-center gap-2 h-auto py-4"
              >
                <Image className="h-6 w-6 text-[var(--color-primary)]" />
                <span className="text-xs">{t("sheet.photos")}</span>
              </Button>
              <Button
                variant="ghost"
                className="flex flex-col items-center gap-2 h-auto py-4"
              >
                <Music className="h-6 w-6 text-[var(--color-primary)]" />
                <span className="text-xs">{t("sheet.music")}</span>
              </Button>
              <Button
                variant="ghost"
                className="flex flex-col items-center gap-2 h-auto py-4"
              >
                <Video className="h-6 w-6 text-[var(--color-primary)]" />
                <span className="text-xs">{t("sheet.videos")}</span>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </DemoCard>
  );
}
