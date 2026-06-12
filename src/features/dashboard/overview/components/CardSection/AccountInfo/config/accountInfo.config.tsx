// Account info configuration
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconCopy,
  IconShield,
} from "@tabler/icons-react";
import { ReactNode } from "react";

export interface ActionButtonConfig {
  id: string;
  translationKey: string;
  fallbackLabel: string;
  icon: ReactNode;
}

// Action buttons configuration
export const actionButtonsConfig: Omit<ActionButtonConfig, "icon">[] = [
  {
    id: "send",
    translationKey: "Dashboard.send",
    fallbackLabel: "Send",
  },
  {
    id: "receive",
    translationKey: "Dashboard.receive",
    fallbackLabel: "Receive",
  },
  {
    id: "copy",
    translationKey: "Dashboard.copy",
    fallbackLabel: "Copy",
  },
  {
    id: "block",
    translationKey: "Dashboard.block",
    fallbackLabel: "Block",
  },
];

// Icon mapping for action buttons
export const actionButtonIcons: Record<
  string,
  (className: string) => ReactNode
> = {
  send: (className) => <IconArrowUpRight className={className} />,
  receive: (className) => <IconArrowDownLeft className={className} />,
  copy: (className) => <IconCopy className={className} />,
  block: (className) => <IconShield className={className} />,
};

// Default balance for demo
export const defaultBalance = 2800.28;
