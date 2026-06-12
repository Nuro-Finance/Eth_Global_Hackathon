import { useTranslations } from "next-intl";
import { FieldError, UseFormRegister } from "react-hook-form";
import { QuickTransferFormData } from "../config";
import { FormField } from "@/components/ui";

interface RecipientNameFieldProps {
  register: UseFormRegister<QuickTransferFormData>;
  error?: FieldError;
}

export function RecipientNameField({
  register,
  error,
}: RecipientNameFieldProps) {
  const t = useTranslations();

  return (
    <FormField
      id="recipient"
      label={t("Dashboard.recipientName") || "Recipient Name"}
      placeholder={t("Dashboard.enterRecipientName") || "Enter recipient name"}
      error={error}
      {...register("recipient")}
    />
  );
}

interface AccountNumberFieldProps {
  register: UseFormRegister<QuickTransferFormData>;
  error?: FieldError;
}

export function AccountNumberField({
  register,
  error,
}: AccountNumberFieldProps) {
  const t = useTranslations();

  return (
    <FormField
      id="accountNumber"
      label={t("Dashboard.accountNumber") || "Account Number"}
      placeholder={t("Dashboard.enterAccountNumber") || "Enter account number"}
      error={error}
      {...register("accountNumber")}
    />
  );
}

interface AmountFieldProps {
  register: UseFormRegister<QuickTransferFormData>;
  error?: FieldError;
}

export function AmountField({ register, error }: AmountFieldProps) {
  const t = useTranslations();

  return (
    <FormField
      id="amount"
      label={t("Dashboard.amount") || "Amount"}
      placeholder={t("Dashboard.enterAmount") || "Enter amount"}
      type="number"
      step="0.01"
      error={error}
      {...register("amount", { valueAsNumber: true })}
    />
  );
}
