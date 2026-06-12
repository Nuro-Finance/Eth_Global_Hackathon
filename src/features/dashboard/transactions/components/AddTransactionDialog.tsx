"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface TransactionFormData {
  name: string;
  amount: string;
  type: string;
  category: string;
  isIncoming: boolean;
}

interface AddTransactionDialogProps {
 /** Callback when transaction is added */
  onAddTransaction?: (transaction: TransactionFormData) => void;
 /** Whether the dialog is open */
  open?: boolean;
 /** Callback when dialog open state changes */
  onOpenChange?: (open: boolean) => void;
 /** Custom trigger element */
  trigger?: React.ReactNode;
}

export function AddTransactionDialog({
  onAddTransaction,
  open,
  onOpenChange,
  trigger,
}: AddTransactionDialogProps) {
  const t = useTranslations("Transactions");
  const [isOpen, setIsOpen] = useState(false);

 // Form state
  const [formData, setFormData] = useState<TransactionFormData>({
    name: "",
    amount: "",
    type: "",
    category: "",
    isIncoming: false,
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setIsOpen(newOpen);
    }

    if (!newOpen) {
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      amount: "",
      type: "",
      category: "",
      isIncoming: false,
    });
  };

  const handleSubmit = () => {
    if (
      formData.name &&
      formData.amount &&
      formData.type &&
      formData.category
    ) {
      onAddTransaction?.(formData);
      handleOpenChange(false);
    }
  };

  const isFormValid =
    formData.name && formData.amount && formData.type && formData.category;
  const actualOpen = open !== undefined ? open : isOpen;

  const defaultTrigger = (
    <Button variant="default" size="sm" className="w-full sm:w-auto">
      <Plus className="w-4 h-4 me-2" />
      {t("addTransaction")}
    </Button>
  );

  return (
    <Dialog open={actualOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="w-[95vw] max-w-md mx-auto p-4 sm:p-6">
        <DialogHeader className="space-y-2 pb-4">
          <DialogTitle className="text-lg sm:text-xl">
            {t("addTransaction") || "Add Transaction"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[80vh]">
          <div className="space-y-2">
            <Label htmlFor="transactionName" className="text-sm font-medium">
              {t("transactionName") || "Transaction Name"}
            </Label>
            <Input
              id="transactionName"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={
                t("enterTransactionName") || "Enter transaction name"
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transactionAmount" className="text-sm font-medium">
              {t("amount") || "Amount"}
            </Label>
            <Input
              id="transactionAmount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, amount: e.target.value }))
              }
              placeholder={t("enterAmount") || "Enter amount"}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("type") || "Type"}</Label>
            <Select
              value={formData.type}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, type: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectType") || "Select type"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bankTransfer">
                  {t("bankTransfer")}
                </SelectItem>
                <SelectItem value="cardPayment">{t("cardPayment")}</SelectItem>
                <SelectItem value="recurringPayment">
                  {t("recurringPayment")}
                </SelectItem>
                <SelectItem value="directDeposit">
                  {t("directDeposit")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("category") || "Category"}
            </Label>
            <Select
              value={formData.category}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, category: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("selectCategory") || "Select category"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">{t("income")}</SelectItem>
                <SelectItem value="transfer">{t("transfer")}</SelectItem>
                <SelectItem value="entertainment">
                  {t("entertainment")}
                </SelectItem>
                <SelectItem value="shopping">{t("shopping")}</SelectItem>
                <SelectItem value="food">{t("food")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="isIncoming"
              checked={formData.isIncoming}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isIncoming: !!checked }))
              }
            />
            <Label htmlFor="isIncoming" className="text-sm font-medium">
              {t("isIncomeTransaction") || "Income transaction"}
            </Label>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="w-full sm:w-auto"
          >
            {t("cancel") || "Cancel"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="w-full sm:w-auto"
          >
            <Check className="w-4 h-4 me-2" />
            {t("add") || "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
