"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Animation variants for different sides
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const contentVariants = {
  right: {
    hidden: { x: "100%" },
    visible: { x: 0, transitionEnd: { transform: "none", willChange: "auto" } },
    exit: { x: "100%" },
  },
  left: {
    hidden: { x: "-100%" },
    visible: { x: 0, transitionEnd: { transform: "none", willChange: "auto" } },
    exit: { x: "-100%" },
  },
  top: {
    hidden: { y: "-100%" },
    visible: { y: 0, transitionEnd: { transform: "none", willChange: "auto" } },
    exit: { y: "-100%" },
  },
  bottom: {
    hidden: { y: "100%" },
    visible: { y: 0, transitionEnd: { transform: "none", willChange: "auto" } },
    exit: { y: "100%" },
  },
};

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

export function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

export function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay asChild {...props}>
      <motion.div
        data-slot="sheet-overlay"
        className={cn("fixed inset-0 z-50 bg-[var(--color-bg-modal-overlay)]", className)}
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.2, ease: "easeOut" }}
      />
    </SheetPrimitive.Overlay>
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  showOverlay = true,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showClose?: boolean;
  showOverlay?: boolean;
  overlayClassName?: string;
}) {
  return (
    <SheetPortal>
      <AnimatePresence mode="wait">
        {showOverlay && <SheetOverlay key="sheet-overlay" className={overlayClassName} />}
        <SheetPrimitive.Content asChild {...props}>
          <motion.div
            key="sheet-content"
            data-slot="sheet-content"
            className={cn(
              "bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-glass)] glass-card-inner fixed z-50 flex flex-col shadow-lg border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)]",
              side === "right" &&
              "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-md",
              side === "left" &&
              "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-md",
              side === "top" && "inset-x-0 top-0 h-auto border-b",
              side === "bottom" && "inset-x-0 bottom-0 h-auto border-t",
              className
            )}
            variants={contentVariants[side]}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 300,
              duration: 0.3,
            }}
          >
            {children}
            {showClose && (
              <SheetPrimitive.Close className="absolute top-4 end-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
                <XIcon
                  className="size-4"
                  color="var(--color-text-primary)"
                />
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            )}
          </motion.div>
        </SheetPrimitive.Content>
      </AnimatePresence>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 px-6 pt-6 pb-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-2 px-6 py-4 border-t border-[var(--color-border-primary)]",
        className
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "text-[var(--color-text-primary)] font-semibold",
        className
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-[var(--color-text-muted)] text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
