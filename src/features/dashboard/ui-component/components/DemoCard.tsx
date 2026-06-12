"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface DemoCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export default function DemoCard({
  title,
  description,
  children,
  className,
}: DemoCardProps) {
  return (
    <Card
      className={cn(
        "rounded-2xl p-4 px-4 md:px-6 pb-8 pt-5 md:pt-10 w-full",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          {title}
        </h3>
        <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
      </div>

      <div className="flex flex-col gap-6">{children}</div>
    </Card>
  );
}
