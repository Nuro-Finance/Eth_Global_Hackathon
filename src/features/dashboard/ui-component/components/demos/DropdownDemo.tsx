"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  ChevronDown,
  Pencil,
  Copy,
  Archive,
  Trash2,
  User,
  CreditCard,
  Settings,
  LogOut,
  Mail,
  MessageSquare,
  Share2,
  FileText,
  FileSpreadsheet,
  FileDown,
  Printer,
  Plus,
  FolderOpen,
  Clipboard,
  Undo,
  Redo,
} from "lucide-react";
import DemoCard from "../DemoCard";

export default function DropdownDemo() {
  const t = useTranslations("UIComponent");
  const [showStatusBar, setShowStatusBar] = React.useState(true);
  const [showActivityBar, setShowActivityBar] = React.useState(false);
  const [position, setPosition] = React.useState("bottom");

  return (
    <DemoCard
      title={t("dropdown.title")}
      description={t("dropdown.description")}
    >
      {/* Basic Dropdown */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dropdown.basicDropdown")}
        </h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {t("dropdown.openMenu")}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{t("dropdown.myAccount")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" /> {t("dropdown.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCard className="mr-2 h-4 w-4" /> {t("dropdown.billing")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" /> {t("dropdown.settings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 h-4 w-4" /> {t("dropdown.logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* With Icons */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dropdown.withIcons")}
        </h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <Pencil className="mr-2 h-4 w-4" /> {t("dropdown.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" /> {t("dropdown.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Archive className="mr-2 h-4 w-4" /> {t("dropdown.archive")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[var(--color-error)]">
              <Trash2 className="mr-2 h-4 w-4" /> {t("dropdown.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* With Checkboxes */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dropdown.checkboxItems")}
        </h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">{t("dropdown.viewOptions")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>{t("dropdown.appearance")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showStatusBar}
              onCheckedChange={setShowStatusBar}
            >
              {t("dropdown.statusBar")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showActivityBar}
              onCheckedChange={setShowActivityBar}
            >
              {t("dropdown.activityBar")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* With Radio Items */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dropdown.radioItems")}
        </h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">{t("dropdown.panelPosition")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>{t("dropdown.position")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={position}
              onValueChange={setPosition}
            >
              <DropdownMenuRadioItem value="top">
                {t("dropdown.top")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bottom">
                {t("dropdown.bottom")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="right">
                {t("dropdown.right")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* With Submenu */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dropdown.withSubmenu")}
        </h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">{t("dropdown.moreOptions")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuItem>
              <Plus className="mr-2 h-4 w-4" /> {t("dropdown.newTab")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FolderOpen className="mr-2 h-4 w-4" /> {t("dropdown.newWindow")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Share2 className="mr-2 h-4 w-4" /> {t("dropdown.share")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <Mail className="mr-2 h-4 w-4" /> {t("dropdown.email")}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MessageSquare className="mr-2 h-4 w-4" />{" "}
                  {t("dropdown.message")}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Share2 className="mr-2 h-4 w-4" />{" "}
                  {t("dropdown.socialMedia")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileDown className="mr-2 h-4 w-4" /> {t("dropdown.export")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <FileText className="mr-2 h-4 w-4" /> {t("dropdown.pdf")}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />{" "}
                  {t("dropdown.csv")}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />{" "}
                  {t("dropdown.excel")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Printer className="mr-2 h-4 w-4" /> {t("dropdown.print")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Disabled Items */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("dropdown.withDisabledItems")}
        </h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">{t("dropdown.actions")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" /> {t("dropdown.copy")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Clipboard className="mr-2 h-4 w-4" /> {t("dropdown.cut")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Clipboard className="mr-2 h-4 w-4" />{" "}
              {t("dropdown.pasteDisabled")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Undo className="mr-2 h-4 w-4" /> {t("dropdown.undoDisabled")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Redo className="mr-2 h-4 w-4" /> {t("dropdown.redo")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </DemoCard>
  );
}
