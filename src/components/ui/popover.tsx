"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

// Type for pointer down outside event from Radix
type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>;
type FocusOutsideEvent = CustomEvent<{ originalEvent: FocusEvent }>;
type InteractOutsideEvent = PointerDownOutsideEvent | FocusOutsideEvent;

/** Radix dispatches these on `detail.originalEvent.target`; `event.target` is often wrong. */
function radixOutsidePointerTarget(event: Event): Element | null {
  if ("detail" in event && event.detail && typeof event.detail === "object") {
    const original = (event.detail as { originalEvent?: Event }).originalEvent;
    const t = original?.target;
    if (t instanceof Element) return t;
  }
  const t = (event as Event).target;
  return t instanceof Element ? t : null;
}

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

const popoverSlideIn =
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  onInteractOutside,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const handlePointerDownOutside = React.useCallback(
    (event: PointerDownOutsideEvent) => {
      // Check if any Select dropdown is currently open in the DOM
      // If so, prevent the popover from closing (the select will handle closing itself)
      const openSelectContent = document.querySelector(
        '[data-radix-select-content][data-state="open"], [data-radix-select-viewport]'
      );
      if (openSelectContent) {
        event.preventDefault();
        return;
      }

      // Also check if clicking on select-related elements
      const target = radixOutsidePointerTarget(event);
      if (
        target?.closest("[data-radix-select-content]") ||
        target?.closest('[role="listbox"]') ||
        target?.closest("[data-radix-collection-item]") ||
        target?.closest("[data-radix-select-viewport]")
      ) {
        event.preventDefault();
        return;
      }

      onPointerDownOutside?.(event);
    },
    [onPointerDownOutside]
  );

  const handleInteractOutside = React.useCallback(
    (event: InteractOutsideEvent) => {
      // Check if any Select dropdown is currently open
      const openSelectContent = document.querySelector(
        '[data-radix-select-content][data-state="open"], [data-radix-select-viewport]'
      );
      if (openSelectContent) {
        event.preventDefault();
        return;
      }

      const target = radixOutsidePointerTarget(event);
      if (
        target?.closest("[data-radix-select-content]") ||
        target?.closest('[role="listbox"]') ||
        target?.closest("[data-radix-collection-item]") ||
        target?.closest("[data-radix-select-viewport]")
      ) {
        event.preventDefault();
        return;
      }
      onInteractOutside?.(event);
    },
    [onInteractOutside]
  );

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        onPointerDownOutside={handlePointerDownOutside}
        onInteractOutside={handleInteractOutside}
        className={cn(
          "bg-[var(--color-bg-card)] backdrop-blur-[var(--glass-blur)] dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner text-[var(--color-text-primary)] border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          popoverSlideIn,
          "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
