"use client";
import { Link } from "@/i18n/navigation";
import { useProgress } from "@bprogress/next";
import { ComponentProps } from "react";

interface ProgressLinkProps extends ComponentProps<typeof Link> {
  children: React.ReactNode;
}

/**
 * Link component that triggers progress bar on navigation
 * Works with next-intl internationalized routing
 */
export default function ProgressLink({ 
  children, 
  onClick, 
  ...props 
}: ProgressLinkProps) {
  const { start } = useProgress();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
 // Only start progress for regular clicks (not cmd+click, ctrl+click, etc.)
    if (
      !e.ctrlKey && 
      !e.metaKey && 
      !e.shiftKey && 
      e.button === 0 && 
      !props.target
    ) {
      start();
    }
    
 // Call original onClick if provided
    onClick?.(e);
  };

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  );
}
