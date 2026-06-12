"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-lg bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const TooltipArrow = (props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Arrow>) => (
  <TooltipPrimitive.Arrow
    {...props}
    className={cn("fill-[var(--color-bg-card)] stroke-[var(--color-border-primary)]", props.className)}
  />
);

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipArrow };
