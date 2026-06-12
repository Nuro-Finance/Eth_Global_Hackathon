"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Package, Star, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DemoCard from "../DemoCard";

export default function CardDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard title={t("card.title")} description={t("card.description")}>
      {/* Feature Card */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("card.featureCard")}
        </h4>
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-[var(--color-primary)]" />
              <CardTitle>{t("card.proPlan")}</CardTitle>
              <Badge>{t("card.popular")}</Badge>
            </div>
            <CardDescription>{t("card.proDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">
              $29
              <span className="text-sm font-normal text-[var(--color-text-muted)]">
                {t("card.perMonth")}
              </span>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-[var(--color-text-primary)]">
                <Check className="w-4 h-4 text-[var(--color-success)]" />
                {t("card.unlimitedProjects")}
              </li>
              <li className="flex items-center gap-2 text-[var(--color-text-primary)]">
                <Check className="w-4 h-4 text-[var(--color-success)]" />
                {t("card.prioritySupport")}
              </li>
              <li className="flex items-center gap-2 text-[var(--color-text-primary)]">
                <Check className="w-4 h-4 text-[var(--color-success)]" />
                {t("card.advancedAnalytics")}
              </li>
              <li className="flex items-center gap-2 text-[var(--color-text-primary)]">
                <Check className="w-4 h-4 text-[var(--color-success)]" />
                {t("card.customIntegrations")}
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full">{t("card.getStarted")}</Button>
          </CardFooter>
        </Card>
      </div>
      {/* Basic Card */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("card.basicCard")}
        </h4>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>{t("card.cardTitle")}</CardTitle>
            <CardDescription>{t("card.cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--color-text-primary)]">
              {t("card.mainContent")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Card with Footer */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("card.withFooter")}
        </h4>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>{t("card.notifications")}</CardTitle>
            <CardDescription>{t("card.unreadMessages")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--color-text-primary)]">
              {t("card.configureNotifications")}
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline">{t("common.cancel")}</Button>
            <Button>{t("common.save")}</Button>
          </CardFooter>
        </Card>
      </div>

      {/* Interactive Card */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("card.interactiveCard")}
        </h4>
        <Card className="max-w-sm cursor-pointer transition-all hover:shadow-lg hover:border-[var(--color-border-active)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[var(--color-primary)]" />
              {t("card.projectAlpha")}
            </CardTitle>
            <CardDescription>{t("card.clickToViewDetails")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">{t("card.inProgress")}</Badge>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t("card.updatedAgo")}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </DemoCard>
  );
}
