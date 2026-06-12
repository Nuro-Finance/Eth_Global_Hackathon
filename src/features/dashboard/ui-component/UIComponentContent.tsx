"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SmoothTabs, SmoothTabItem } from "@/components/SmoothTabs";
import {
  Table2,
  Layers,
  ListFilter,
  FormInput,
  MousePointerClick,
  CreditCard,
  CircleDot,
  PanelsTopLeft,
  MessageCircle,
} from "lucide-react";

// Import all demos from the demos folder
import {
  ButtonDemo,
  IconButtonDemo,
  InputDemo,
  SwitchDemo,
  CheckboxDemo,
  SelectDemo,
  DatePickerDemo,
  PhoneInputDemo,
  CountrySelectDemo,
  CalendarDemo,
  BadgeDemo,
  AvatarDemo,
  CardDemo,
  TableDemo,
  TabsDemo,
  DialogDemo,
  SheetDemo,
  PopoverDemo,
  TooltipDemo,
  DropdownDemo,
  DraggableStatCardsDemo,
  PaginationDemo,
} from "./components/demos";

export default function UIComponentContent() {
  const t = useTranslations("UIComponent");
  const searchParams = useSearchParams();

  // Get initial tab from URL or default to first tab
  const getInitialTab = () => {
    const urlTab = searchParams?.get("tab");
    return urlTab || "inputs";
  };

  const [selectedTab, setSelectedTab] = useState(getInitialTab);

  // Sync with URL changes
  useEffect(() => {
    const urlTab = searchParams?.get("tab");
    if (urlTab) {
      setSelectedTab(urlTab);
    }
  }, [searchParams]);

  const tabs: SmoothTabItem[] = [
    {
      id: "cards",
      title: t("sections.cards"),
      icon: CreditCard,
      cardContent: (
        <div className="flex flex-col gap-6">
          <DraggableStatCardsDemo />
          <CardDemo />
        </div>
      ),
    },
    {
      id: "navigation",
      title: t("sections.navigation"),
      icon: PanelsTopLeft,
      cardContent: (
        <div className="flex flex-col gap-6">
          <TabsDemo />
          <PaginationDemo />
        </div>
      ),
    },
    {
      id: "tables",
      title: t("sections.tables"),
      icon: Table2,
      cardContent: (
        <div className="flex flex-col gap-6">
          <TableDemo />
        </div>
      ),
    },

    {
      id: "dialogs",
      title: t("sections.dialogs"),
      icon: Layers,
      cardContent: (
        <div className="flex flex-col gap-6">
          <DialogDemo />
          <SheetDemo />
        </div>
      ),
    },
    {
      id: "menus",
      title: t("sections.menus"),
      icon: ListFilter,
      cardContent: (
        <div className="flex flex-col gap-6">
          <DropdownDemo />
          <PopoverDemo />
        </div>
      ),
    },
    {
      id: "buttons",
      title: t("sections.buttons"),
      icon: MousePointerClick,
      cardContent: (
        <div className="flex flex-col gap-6">
          <ButtonDemo />
          <IconButtonDemo />
        </div>
      ),
    },
    {
      id: "indicators",
      title: t("sections.indicators"),
      icon: CircleDot,
      cardContent: (
        <div className="flex flex-col gap-6">
          <BadgeDemo />
          <AvatarDemo />
        </div>
      ),
    },

    {
      id: "feedback",
      title: t("sections.feedback"),
      icon: MessageCircle,
      cardContent: (
        <div className="flex flex-col gap-6">
          <TooltipDemo />
        </div>
      ),
    },
    {
      id: "inputs",
      title: t("sections.inputs"),
      icon: FormInput,
      cardContent: (
        <div className="flex flex-col gap-6">
          <InputDemo />
          <CalendarDemo />
          <DatePickerDemo />
          <PhoneInputDemo />
          <CountrySelectDemo />
          <CheckboxDemo />
          <SwitchDemo />
          <SelectDemo />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SmoothTabs
        items={tabs}
        contentClassName="bg-transparent border-none"
        showCardContent={true}
        cardHeight="auto"
        tabsPosition="top"
        className="w-full"
        syncWithUrl={true}
        onValueChange={setSelectedTab}
      />
    </div>
  );
}
