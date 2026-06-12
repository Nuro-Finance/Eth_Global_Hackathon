"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FULL_MODAL_OVERLAY_CLASS,
  FULL_MODAL_SURFACE_CLASS,
} from "@/components/ui/modalPresets";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { Notification } from "../types";
import { NotificationList } from "./NotificationList";

const layerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const cascadeVariants = {
  initial: { opacity: 0, y: -12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.33, 1, 0.68, 1],
    },
  },
};

interface NotificationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
  emptyMessage: string;
  markAsReadLabel: string;
  removeLabel: string;
}

/**
 * Glass layer + brighter dark tint; width/height generous; header close shares
 * the same horizontal inset as notification rows (px-4 shell + px-3 row).
 */
export function NotificationsModal({
  open,
  onOpenChange,
  title,
  notifications,
  onMarkAsRead,
  onRemove,
  emptyMessage,
  markAsReadLabel,
  removeLabel,
}: NotificationsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className="notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 !overflow-visible p-[12px] max-h-[min(85vh,42rem)] h-auto w-[calc(100vw-2rem)] max-w-2xl !rounded-[56px] backdrop-blur-md shadow-xl"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px', borderStyle: 'solid' }}
      >
        <div 
          className="relative w-full h-full !backdrop-blur-none rounded-[44px] overflow-hidden flex flex-col border"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          <motion.div 
            className="flex flex-col flex-1 min-h-0"
            variants={layerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="shrink-0 px-4 pt-6 pb-3" variants={cascadeVariants}>
              <div className="flex items-center justify-between gap-3 pl-3 pr-3">
                <DialogTitle className="m-0 flex-1 text-start text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                  {title}
                </DialogTitle>
                <DialogClose asChild>
                  <button
                    type="button"
                    className={cn(
                      "shrink-0 w-8 h-8 p-1.5 flex items-center justify-center rounded-[10px] text-[var(--color-text-muted)] outline-none transition-all",
                      "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                      "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                    )}
                    aria-label="Close"
                  >
                    <X className="h-full w-full" strokeWidth={2} />
                  </button>
                </DialogClose>
              </div>
            </motion.div>

            <motion.div 
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-0 pb-2 scroll-gutter-stable"
              variants={cascadeVariants}
              style={{ 
                maskImage: 'linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)'
              }}
            >
              <NotificationList
                notifications={notifications}
                onMarkAsRead={onMarkAsRead}
                onRemove={onRemove}
                emptyMessage={emptyMessage}
                markAsReadLabel={markAsReadLabel}
                removeLabel={removeLabel}
              />
            </motion.div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
