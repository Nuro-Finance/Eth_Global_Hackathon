"use client";

import { ReactNode } from "react";
import {
  Tooltip as TooltipPrimitive,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./ui/tooltip";

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  show?: boolean;
}

export default function Tooltip({
  content,
  children,
  position = "right",
  show = false,
}: TooltipProps) {
  // Convert position to side for shadcn
  const getSide = () => {
    switch (position) {
      case "top":
        return "top";
      case "bottom":
        return "bottom";
      case "left":
        return "left";
      case "right":
      default:
        return "right";
    }
  };

  return (
    <TooltipProvider>
      <TooltipPrimitive open={show}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={getSide()}>{content}</TooltipContent>
      </TooltipPrimitive>
    </TooltipProvider>
  );
}
