"use client";

import { useTranslations } from "next-intl";
import { Greeting } from "@/components";
import QuickActions from "./components/QuickActions";

export default function DashboardHeader() {
  return (
    <div className="mb-8">
      <div className="flex min-w-0 flex-row items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Greeting />
        </div>
        <div className="flex shrink-0 items-center">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
