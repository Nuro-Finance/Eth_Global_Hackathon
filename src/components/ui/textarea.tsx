import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] px-3 py-2 text-sm ring-offset-background placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/20 focus-visible:ring-offset-0 focus:border-[var(--color-primary)]/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
