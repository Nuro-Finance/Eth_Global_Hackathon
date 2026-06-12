"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { WithdrawFlow } from "@/features/dashboard/my-card-1/components/WithdrawFlow";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WithdrawModal({ open, onClose }: Props) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-0 sm:p-4"
          >
            <div className="w-full sm:max-w-[400px] max-h-[85vh] rounded-t-[28px] sm:rounded-[24px] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] shadow-2xl overflow-hidden">
              <div className="p-6 h-[520px] flex flex-col">
                <WithdrawFlow
                  onClose={onClose}
                  onBack={onClose}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
