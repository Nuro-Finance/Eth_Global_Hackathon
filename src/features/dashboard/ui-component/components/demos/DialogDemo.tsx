"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import DemoCard from "../DemoCard";

export default function DialogDemo() {
  const t = useTranslations("UIComponent");
  const [open, setOpen] = useState(false);

  return (
    <DemoCard title={t("dialog.title")} description={t("dialog.description")}>
      {/* Basic Dialog */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dialog.basicDialog")}
        </h4>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("dialog.openDialog")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dialog.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("dialog.basicDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-[var(--color-text-primary)]">
                {t("dialog.mainContent")}
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("common.cancel")}</Button>
              </DialogClose>
              <Button>{t("common.confirm")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Form Dialog */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dialog.formDialog")}
        </h4>
        <Dialog>
          <DialogTrigger asChild>
            <Button>{t("dialog.editProfile")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dialog.editProfile")}</DialogTitle>
              <DialogDescription>
                {t("dialog.editProfileDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">{t("dialog.name")}</Label>
                <Input id="name" defaultValue="John Doe" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">{t("dialog.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue="john@example.com"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("common.cancel")}</Button>
              </DialogClose>
              <Button>{t("dialog.saveChanges")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Controlled Dialog */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dialog.controlledDialog")}
        </h4>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {t("dialog.deleteAccount")}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dialog.confirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("dialog.confirmDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={() => setOpen(false)}>
                {t("dialog.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Alert Dialog Style */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dialog.alertStyle")}
        </h4>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("dialog.showAlert")}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[var(--color-warning)]" />
                {t("dialog.warning")}
              </DialogTitle>
              <DialogDescription>
                {t("dialog.unsavedChanges")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-start gap-2">
              <DialogClose asChild>
                <Button variant="outline">{t("dialog.dontSave")}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>{t("dialog.saveChanges")}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DemoCard>
  );
}
