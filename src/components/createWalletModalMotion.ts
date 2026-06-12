import type { Variants } from "framer-motion";

export const walletModalShellLayerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.12,
    },
  },
} satisfies Variants;

export const walletModalItemCascadeVariants = {
  initial: { opacity: 0, y: -10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.62,
      ease: [0.33, 1, 0.68, 1] as const,
    },
  },
} satisfies Variants;

export const walletModalFlowLayerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.11,
      delayChildren: 0.08,
    },
  },
} satisfies Variants;
