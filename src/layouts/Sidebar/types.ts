import { ReactNode } from 'react';

export interface SidebarItemProps {
  id: string;
  icon: ReactNode;
  label: string;
  href: string;
  isActive?: boolean;
  badge?: number;
  tooltip?: string;
  collapsed?: boolean;
  tooltipPosition?: "left" | "right";
}

export interface SidebarProps {
  className?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  defaultActiveRoute?: string;
  isMobileMenuOpen?: boolean;
  onMobileMenuClose?: () => void;
}

export interface SidebarLogoProps {
  collapsed?: boolean;
}

export interface SidebarUserProps {
  user?: {
    name: string;
    avatar?: string;
    role?: string;
  };
  onLogout?: () => void;
  collapsed?: boolean;
}

export interface NavigationItem extends Omit<SidebarItemProps, 'isActive' | 'collapsed'> {
  id: string;
  icon: ReactNode;
  label: string;
  href: string;
  tooltip: string;
}
