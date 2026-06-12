"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetFooter as SheetFooterUI,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  QuickTransferSheetHeader,
  RecipientNameField,
  AccountNumberField,
  AmountField,
  CurrencySelector,
  DatePicker,
  SheetFooter,
} from "./components";
import { useQuickTransferForm, useTransferSubmit } from "./hooks";

interface QuickTransferSheetProps {
  children: React.ReactNode;
}

export default function QuickTransferSheet({
  children,
}: QuickTransferSheetProps) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

 // Determine sheet side based on locale (RTL for Arabic)
  const sheetSide: "left" | "right" = locale === "ar" ? "left" : "right";

  const { register, handleSubmit, errors, setValue, watchedDate, reset } =
    useQuickTransferForm();

  const { submit, isSubmitting } = useTransferSubmit({
    onSuccess: () => {
      reset();
      setOpen(false);
    },
  });

  const onSubmit = async (data: any) => {
    await submit(data);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side={sheetSide}
        className={cn(
          "w-full max-w-md scroll-gutter-stable overflow-y-auto p-0 flex flex-col",
          "bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)]"
        )}
      >
        <QuickTransferSheetHeader />

        <div className="flex-1 px-6 py-3">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Recipient Name */}
            <RecipientNameField register={register} error={errors.recipient} />

            {/* Account Number */}
            <AccountNumberField
              register={register}
              error={errors.accountNumber}
            />

            {/* Amount */}
            <AmountField register={register} error={errors.amount} />

            {/* Currency */}
            <CurrencySelector
              error={errors.currency}
              onValueChange={(value) =>
                setValue("currency", value as "USD" | "GBP" | "JPY")
              }
              placeholder="Select currency"
            />

            {/* Transfer Date */}
            <DatePicker
              value={watchedDate}
              onSelect={(date) => setValue("transferDate", date || new Date())}
              error={errors.transferDate}
              placeholder="Pick a date"
              label="Transfer Date"
            />
          </form>
        </div>

        <SheetFooter
          isSubmitting={isSubmitting}
          onCancel={() => setOpen(false)}
          onSubmit={handleSubmit(onSubmit)}
        />
      </SheetContent>
    </Sheet>
  );
}
