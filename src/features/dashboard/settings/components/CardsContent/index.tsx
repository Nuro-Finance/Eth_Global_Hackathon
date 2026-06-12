"use client";

import React from "react";
import {
  CreditCard,
  Check,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Snowflake,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronLeft,
  X,
} from "lucide-react";
import { ReloadFlowTokenHero, reloadFlowHeroStyles } from "@/features/dashboard/my-card-1/components/ReloadFlow";
import { SettingsSection } from "@/components/settings-section";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORM_MODAL_SHELL_CLASS, FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { SETTINGS_ROW_STACK_CLASS } from "@/features/dashboard/settings/settingsStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_DANGER,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import { cn } from "@/lib/utils";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";
import { CardsEmptyActivation } from "./CardsEmptyActivation";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from "@/components/ui/tooltip";

interface CardData {
  id: string;
  name: string;
  number: string;
  fullNumber: string;
  expiry: string;
  cvv: string;
  type: "Virtual" | "Physical";
  isFrozen: boolean;
  balance: string;
}

const INITIAL_CARDS: CardData[] = [
  {
    id: "1",
    name: "My card",
    number: "•••• •••• •••• 4242",
    fullNumber: "4242 1234 5678 9012",
    expiry: "12/26",
    cvv: "345",
    type: "Virtual",
    isFrozen: false,
    balance: "$2400.00",
  },
  {
    id: "2",
    name: "Expense Card",
    number: "•••• •••• •••• 9999",
    fullNumber: "9999 8888 7777 6666",
    expiry: "09/27",
    cvv: "112",
    type: "Physical",
    isFrozen: false,
    balance: "$1250.00",
  },
  {
    id: "3",
    name: "Subscription Setup",
    number: "•••• •••• •••• 1234",
    fullNumber: "1234 5678 9012 3456",
    expiry: "01/25",
    cvv: "888",
    type: "Virtual",
    isFrozen: true,
    balance: "$80.00",
  },
  {
    id: "4",
    name: "Travel Card",
    number: "•••• •••• •••• 5555",
    fullNumber: "5555 4444 3333 2222",
    expiry: "11/28",
    cvv: "420",
    type: "Physical",
    isFrozen: false,
    balance: "$5400.00",
  },
];

const CARD_ACTION_BUTTON_CLASS =
  "flex items-center justify-center w-9 h-9 rounded-[var(--radius-sm)] border-0 bg-white/5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/10 transition-all";

const CARD_LIST_ICON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-white [&_svg]:h-5 [&_svg]:w-5";

const FROZEN_CARD_ICON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/20 [&_svg]:h-5 [&_svg]:w-5";

const DELETE_CARD_MODAL_INNER_CLASS =
  "relative flex h-[475px] w-full min-h-[475px] max-h-[475px] flex-col overflow-hidden rounded-[26px] border !backdrop-blur-none";

const DELETE_CARD_STEP_ACTIONS_CLASS = "flex shrink-0 items-center gap-3 px-1 pb-1";

const DELETE_CARD_STEP_ICON_PLATE_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-[10px] border-0 bg-[var(--color-error)]/10 text-[var(--color-error)] [&_svg]:h-5 [&_svg]:w-5";

const DELETE_CARD_STEP1_ICON_PLATE_CLASS =
  "flex size-20 shrink-0 items-center justify-center rounded-[16px] border border-[var(--color-error)]/15 bg-[var(--color-error)]/10 text-[var(--color-error)] [&_svg]:h-9 [&_svg]:w-9";

function DeleteCardStepIcon({
  children,
  variants,
  step1 = false,
}: {
  children: React.ReactNode;
  variants?: Variants;
  step1?: boolean;
}) {
  return (
    <motion.div variants={variants} className={cn("mx-auto shrink-0", step1 ? "mb-7" : "mb-5")}>
      <div className={step1 ? DELETE_CARD_STEP1_ICON_PLATE_CLASS : DELETE_CARD_STEP_ICON_PLATE_CLASS}>
        {children}
      </div>
    </motion.div>
  );
}

const modalLayerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.2, ease: "easeIn" } },
};

const modalCascadeVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.33, 1, 0.68, 1] },
  },
};

const ConfirmDeleteModal = ({
  open,
  onOpenChange,
  onConfirm,
  card
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  card: CardData | null;
}) => {
  const [address, setAddress] = React.useState("0x71C7656EC7ab88b098defB751B7401B5f6d8976F");
  const [isEditing, setIsEditing] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [isProcessing, setIsProcessing] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setIsEditing(false);
    setError("");
    setIsProcessing(true);
  }, [open, card?.id]);

  const handleWithdrawAndDelete = () => {
    const isEth = address.startsWith("0x") && address.length === 42 && /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!isEth) {
      setError("Please supply a valid ETH format string (0x...)");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleConfirmContinue = () => {
    setStep(3);
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 15000);
  };

  const stepKey =
    step === 1
      ? "card-delete-step-1"
      : step === 2
        ? "card-delete-step-2-confirm"
        : isProcessing
          ? "card-delete-step-3-processing"
          : "card-delete-step-3-success";

  const renderStep1 = () => (
    <div className="flex h-full min-h-0 flex-col">
      <DeleteCardStepIcon variants={modalCascadeVariants} step1>
        <Trash2 strokeWidth={1.5} />
      </DeleteCardStepIcon>
      <motion.div variants={modalCascadeVariants} className="mb-8 shrink-0">
        <DialogTitle className="mb-2 text-center text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Delete Card?
        </DialogTitle>
        <DialogDescription className="px-2 text-center text-[14px] leading-relaxed text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text-primary)]">{card?.name}</span> has a balance of{" "}
          <span className="font-medium text-[var(--color-text-primary)]">{card?.balance}</span> which will be automatically
          withdrawn to your address. This action cannot be undone.
        </DialogDescription>
      </motion.div>
      <motion.div variants={modalCascadeVariants} className="mb-8 w-full shrink-0">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <label htmlFor="delete-card-withdraw-address" className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
            Withdrawal Address
          </label>
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="text-[12px] font-medium text-white/50 transition-colors outline-none hover:text-[var(--color-text-primary)]"
          >
            {isEditing ? "Save" : "Change"}
          </button>
        </div>
        <div
          className={cn(
            "flex w-full items-center rounded-[12px] border px-3 py-2.5 transition-all",
            isEditing
              ? error
                ? "border-[var(--color-error)]/50 bg-[var(--color-error)]/5"
                : "border-white/30 bg-white/[0.05] shadow-[0_0_15px_rgba(255,255,255,0.03)]"
              : "border-white/10 bg-white/[0.02]"
          )}
        >
          <input
            id="delete-card-withdraw-address"
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (error) setError("");
            }}
            readOnly={!isEditing}
            className="w-full bg-transparent font-mono text-[13px] text-[var(--color-text-primary)] outline-none transition-colors"
          />
        </div>
        {error ? (
          <p className="mt-2 px-1 text-[11.5px] font-medium text-[var(--color-error)]">{error}</p>
        ) : null}
      </motion.div>
    </div>
  );

  const renderStep2Confirm = () => (
    <div className="flex h-full min-h-0 flex-col">
      <motion.div variants={modalCascadeVariants} className="relative h-8 w-full shrink-0">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="absolute left-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--color-text-primary)] outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <DialogTitle className="pointer-events-none absolute inset-x-0 top-0 flex h-8 items-center justify-center px-10 text-center text-[20px] font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
          Confirm & review
        </DialogTitle>
      </motion.div>

      <div className="flex min-h-0 w-full flex-1 flex-col justify-center gap-8">
        <motion.div variants={modalCascadeVariants} className="w-full shrink-0">
          <h1 className="text-center text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            {card?.name}
          </h1>
          <p className="mt-2 text-center text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            {card?.balance}
          </p>
          <h2 className="mt-4 px-2 text-center text-[14px] font-normal leading-relaxed text-[var(--color-text-muted)]">
            Confirm your withdraw address is correct.
            <br />
            This action can not be undone.
          </h2>
        </motion.div>

        <motion.div variants={modalCascadeVariants} className="w-full shrink-0">
          <div className="mb-2.5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
              Withdrawal Address
            </p>
          </div>
          <div className="flex w-full items-center rounded-[12px] border border-white/10 bg-white/[0.02] px-3 py-2.5">
            <p className="min-w-0 flex-1 font-mono text-[13px] leading-normal text-[var(--color-text-primary)]">{address}</p>
          </div>
        </motion.div>
      </div>
    </div>
  );

  const renderStep3 = () =>
    isProcessing ? (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-start pt-8 text-center">
        <style>{reloadFlowHeroStyles}</style>
        <motion.div variants={modalCascadeVariants} className="relative mb-0 flex h-24 w-full shrink-0 items-center justify-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.80]">
            <ReloadFlowTokenHero selectedToken="USDC" pulse />
          </div>
        </motion.div>
        <motion.div variants={modalCascadeVariants} className="flex w-full min-h-0 flex-1 flex-col items-center justify-center">
          <DialogTitle className="mb-2 shrink-0 text-center text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Withdraw in progress
          </DialogTitle>
          <DialogDescription className="max-w-[320px] shrink-0 px-2 text-center text-[14px] leading-relaxed text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-primary)]">{card?.balance} USDC</span> withdraw via smart
            contract. Your card will be permanently deleted.
          </DialogDescription>
          <a
            href="#"
            className="mt-5 flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary)]/80"
          >
            View on Block Explorer <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </motion.div>
        <motion.div variants={modalCascadeVariants} className="w-full shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-[12px] border border-white/10 bg-white/5 px-4 py-3 text-[14px] font-semibold text-[var(--color-text-primary)] transition-all hover:bg-white/10"
          >
            Safe to close
          </button>
        </motion.div>
      </div>
    ) : (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center py-2 text-center">
        <motion.div variants={modalCascadeVariants} className="mb-0 mt-2 flex w-full shrink-0 items-center justify-center">
          <img
            src="/green-check.png"
            alt="Success"
            className="h-20 w-20 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            draggable={false}
          />
        </motion.div>
        <motion.div variants={modalCascadeVariants} className="flex w-full min-h-0 flex-1 flex-col items-center justify-center">
          <DialogTitle className="mb-2 shrink-0 text-center text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Withdrawal Complete
          </DialogTitle>
          <DialogDescription className="max-w-[320px] shrink-0 px-2 text-center text-[14px] leading-relaxed text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-primary)]">{card?.balance}</span> successfully withdrawn.{" "}
            <span className="font-medium text-[var(--color-text-primary)]">{card?.name}</span> has been permanently deleted.
          </DialogDescription>
          <a
            href="#"
            className="mt-5 flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary)]/80"
          >
            View on Block Explorer <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </motion.div>
        <motion.div variants={modalCascadeVariants} className="w-full shrink-0">
          <button
            type="button"
            onClick={() => onConfirm()}
            className="w-full rounded-[12px] border border-white/10 bg-white/5 px-4 py-3 text-[14px] font-semibold text-[var(--color-text-primary)] transition-all hover:bg-white/10"
          >
            Finish
          </button>
        </motion.div>
      </div>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(FORM_MODAL_SHELL_CLASS, "!z-[120]", "!max-w-md")}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <motion.div
          className={DELETE_CARD_MODAL_INNER_CLASS}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <DialogClose asChild>
            <button
              type="button"
              className={cn(
                "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] p-1.5 text-[var(--color-text-muted)] outline-none transition-all",
                "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
              )}
              aria-label="Close"
            >
              <X className="h-full w-full" strokeWidth={2} />
            </button>
          </DialogClose>

          <motion.div
            className="flex h-full min-h-0 flex-col p-8 pb-6"
            variants={modalLayerVariants}
            initial="initial"
            animate="animate"
          >
            <div className={cn("relative isolate flex min-h-0 flex-1 flex-col", step === 3 && "justify-center")}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stepKey}
                  className={cn(
                    "relative z-10 flex h-full min-h-0 w-full flex-1 flex-col",
                    (step === 1 || step === 2) && "pb-12"
                  )}
                  variants={modalLayerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {step === 1 ? renderStep1() : step === 2 ? renderStep2Confirm() : renderStep3()}
                </motion.div>
              </AnimatePresence>
              {step === 1 || step === 2 ? (
                <motion.div
                  variants={modalCascadeVariants}
                  className={cn(DELETE_CARD_STEP_ACTIONS_CLASS, "absolute inset-x-0 bottom-0 z-10")}
                >
                  {step === 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="flex-1 rounded-[12px] border border-white/10 bg-white/5 px-4 py-2.5 text-[14px] font-medium text-[var(--color-text-muted)] transition-all hover:bg-white/10 hover:text-[var(--color-text-primary)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleWithdrawAndDelete}
                        className="flex flex-1 items-center justify-center whitespace-nowrap rounded-[12px] border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 px-4 py-2.5 text-[14px] font-semibold text-[var(--color-error)] transition-all hover:bg-[var(--color-error)]/20"
                      >
                        Withdraw & Delete
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConfirmContinue}
                      className="flex w-full items-center justify-center whitespace-nowrap rounded-[12px] border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 px-4 py-2.5 text-[14px] font-semibold text-[var(--color-error)] transition-all hover:bg-[var(--color-error)]/20"
                    >
                      Withdraw & Delete
                    </button>
                  )}
                </motion.div>
              ) : null}
            </div>

            <motion.div
              variants={modalCascadeVariants}
              className="mt-7 flex shrink-0 animate-in items-center justify-center gap-2 fade-in duration-300"
            >
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  step === 1 ? "w-4 bg-white" : "w-2 bg-white/20"
                )}
              />
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  step === 2 ? "w-4 bg-white" : "w-2 bg-white/20"
                )}
              />
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  step === 3 ? "w-4 bg-white" : "w-2 bg-white/20"
                )}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

const CardItem = ({
  card,
  onDelete,
  onUpdate,
  isDefault = false,
}: {
  card: CardData;
  onDelete: (card: CardData) => void;
  onUpdate: (card: Pick<CardData, "id" | "name" | "isFrozen">) => void;
  isDefault?: boolean;
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isRevealed, setIsRevealed] = React.useState(false);
  const [name, setName] = React.useState(card.name);

  React.useEffect(() => {
    if (isRevealed) {
      const timer = setTimeout(() => setIsRevealed(false), 30000);
      return () => clearTimeout(timer);
    }
  }, [isRevealed]);

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({ id: card.id, name, isFrozen: card.isFrozen });
    setIsEditing(false);
  };

  const handleToggleFreeze = () => {
    onUpdate({ id: card.id, name: card.name, isFrozen: !card.isFrozen });
  };

  const overflowMenuItems = React.useMemo(() => {
    const items: {
      id: string;
      label: string;
      Icon: typeof Pencil;
      variant: "neutral" | "danger";
      action: () => void;
      disabled?: boolean;
    }[] = [
      {
        id: "rename",
        label: "Rename",
        Icon: Pencil,
        variant: "neutral",
        action: () => setIsEditing(true),
      },
    ];
    if (!isDefault) {
      items.push({
        id: "delete",
        label: "Delete",
        Icon: Trash2,
        variant: "danger",
        action: () => onDelete(card),
      });
    }
    return items;
  }, [card, onDelete, isDefault]);

  return (
    <div
      className={cn(
        "group relative flex items-center justify-between rounded-[20px] p-4 transition-all duration-300",
        card.isFrozen
          ? "border border-[var(--color-error)]/20 bg-[var(--color-error)]/[0.03] shadow-[inset_0_0_30px_rgba(244,63,94,0.05)]"
          : "border border-transparent bg-white/[0.04] hover:bg-white/5"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className={card.isFrozen ? FROZEN_CARD_ICON_CLASS : CARD_LIST_ICON_CLASS}>
          <CreditCard />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("flex items-center", isEditing ? "h-8" : "h-6")}>
            {isEditing ? (
              <form onSubmit={handleRename} className="flex items-center gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => {
                    setName(card.name);
                    setIsEditing(false);
                  }}
                  className="h-8 w-full max-w-[200px] rounded-[10px] border border-transparent bg-white/[0.04] px-2 text-[14px] font-medium leading-none text-[var(--color-text-primary)] outline-none transition-colors focus:border-white/30 focus:bg-white/[0.08]"
                />
                <button
                  type="submit"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-success)] transition-colors hover:bg-white/[0.04]"
                >
                  <Check className="h-4 w-4" strokeWidth={2} />
                </button>
              </form>
            ) : (
              <h4 className="text-[14px] font-medium text-[var(--color-text-primary)] truncate flex items-center gap-2">
                {card.name}
                {card.isFrozen && (
                  <span className="text-[10px] font-bold tracking-wider uppercase bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 px-2 py-0.5 rounded-full text-[var(--color-error)] shadow-[inset_0_0_8px_rgba(244,63,94,0.1)]">
                    Frozen
                  </span>
                )}
              </h4>
            )}
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)] font-mono mt-0.5 whitespace-nowrap uppercase truncate">
            <span className="font-bold text-[var(--color-text-primary)] mr-1">{card.type}:</span>
            {isRevealed ? (
              <span className="transition-opacity duration-300 text-[var(--color-text-primary)]">
                {card.fullNumber}
                <span className="ml-4">EXP:{card.expiry}</span>
                <span className="ml-4">CVC:{card.cvv}</span>
              </span>
            ) : (
              <span className="transition-opacity duration-300">
                {card.number}
              </span>
            )}
          </p>
        </div>
      </div>

      {!isRevealed && (
        <div className="mr-16 lg:mr-32 w-[100px] flex flex-row items-center justify-start text-[15px] font-medium text-[var(--color-text-primary)] whitespace-nowrap animate-in fade-in duration-300">
          <span className="text-[var(--color-text-muted)] font-normal mr-[2px]">$</span>
          <span className="tracking-tight">{card.balance.replace('$', '')}</span>
        </div>
      )}

      <div className={`flex items-center gap-2 transition-all duration-200 ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <button
          onClick={() => setIsRevealed(!isRevealed)}
          className={cn(
            CARD_ACTION_BUTTON_CLASS,
            isRevealed && "bg-white/10 text-white hover:bg-white/20"
          )}
          title={isRevealed ? "Hide details" : "Reveal details"}
        >
          {isRevealed ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
        </button>

        <button
          onClick={handleToggleFreeze}
          className={cn(
            card.isFrozen
              ? "flex items-center justify-center w-9 h-9 rounded-[var(--radius-sm)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 text-[var(--color-error)] transition-all hover:bg-[var(--color-error)]/20"
              : CARD_ACTION_BUTTON_CLASS
          )}
          title={card.isFrozen ? "Unfreeze Card" : "Freeze Card"}
        >
          <Snowflake className="w-4 h-4" strokeWidth={1.5} />
        </button>

        <DropdownMenu onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(CARD_ACTION_BUTTON_CLASS, "outline-none")}
              title="More Actions"
            >
              <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className={WALLET_GLASS_MENU_CONTENT}>
            {overflowMenuItems.map(({ id, label, Icon, variant, action, disabled }, index) => (
              <DropdownMenuItem
                key={id}
                textValue={label}
                disabled={disabled}
                className={cn(
                  WALLET_GLASS_MENU_ITEM_ROW_BASE,
                  "!flex min-w-0 items-center gap-2",
                  walletGlassMenuItemRowSpacing(index, overflowMenuItems.length),
                  variant === "danger"
                    ? WALLET_GLASS_MENU_ITEM_ROW_DANGER
                    : WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
                  disabled && "pointer-events-none opacity-40"
                )}
                onSelect={action}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                <span className="min-w-0 flex-1 text-left">{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default function CardsContent() {
  const { newUserEmpty } = useDevPreviewMode();
  const [cards, setCards] = React.useState<CardData[]>(INITIAL_CARDS);
  const [deletingCard, setDeletingCard] = React.useState<CardData | null>(null);

  React.useEffect(() => {
    setCards(newUserEmpty ? [] : INITIAL_CARDS);
  }, [newUserEmpty]);

  const defaultCard = cards[0] ?? null;
  const listCards = cards.slice(1);

  const handleUpdate = (updated: Pick<CardData, "id" | "name" | "isFrozen">) => {
    setCards(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  };

  const handleDelete = () => {
    if (deletingCard) {
      setCards(prev => prev.filter(c => c.id !== deletingCard.id));
      setDeletingCard(null);
    }
  };

  const orderPhysicalCardButton = (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-block cursor-not-allowed">
            <button 
              type="button"
              className="h-8 px-3 rounded-[var(--radius-sm)] bg-transparent border border-[var(--color-border-shell)] dark:border-[var(--color-border-glass-strong)] flex items-center justify-center gap-2 outline-none text-[var(--color-text-primary)] text-[12px] font-medium tracking-tight opacity-40 pointer-events-none"
            >
              Order Physical Card
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          sideOffset={8}
          className="rounded-[12px] bg-[var(--color-bg-glass)] border border-white/10 text-[var(--color-text-primary)] text-[12px] font-medium whitespace-nowrap !shadow-none !backdrop-blur-xl"
          style={{ WebkitBackdropFilter: "blur(25px)", backdropFilter: "blur(25px)" }}
        >
          Coming soon
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const isEmpty = cards.length === 0;

  return (
    <div className={cn(isEmpty && "flex h-full min-h-0 flex-col")}>
    <SettingsSection
      title="Cards"
      description="Manage your card settings"
      icon={<CreditCard className="h-5 w-5" />}
      fillBody={isEmpty}
      actions={orderPhysicalCardButton}
    >
      {isEmpty ? (
        <CardsEmptyActivation />
      ) : (
      <div className="flex flex-col gap-6">
        {defaultCard ? (
          <div className={SETTINGS_ROW_STACK_CLASS}>
            <h1 className="text-[16px] font-medium text-[var(--color-text-primary)]">
              Default card
            </h1>
            <CardItem
              card={defaultCard}
              isDefault
              onDelete={setDeletingCard}
              onUpdate={handleUpdate}
            />
          </div>
        ) : null}
        {listCards.length > 0 ? (
          <div className={SETTINGS_ROW_STACK_CLASS}>
            <h2 className="text-[16px] font-medium text-[var(--color-text-primary)]">
              Account cards
            </h2>
            {listCards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                onDelete={setDeletingCard}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        ) : null}
      </div>
      )}

      <ConfirmDeleteModal
        open={!!deletingCard}
        onOpenChange={(open) => !open && setDeletingCard(null)}
        onConfirm={handleDelete}
        card={deletingCard}
      />
    </SettingsSection>
    </div>
  );
}
