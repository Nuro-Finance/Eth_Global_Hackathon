"use client";

import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { Button, Avatar } from "@/components/ui";
import Dropdown from "@/components/dropdown";
import { useUserMenuItems } from "./useUserMenuItems";

interface UserDropdownProps {
  className?: string;
}

/**
 * User dropdown with avatar, name, and menu options (used where header-style trigger is needed)
 */
export function UserDropdown({ className = "" }: UserDropdownProps) {
  const { user } = useSelector((state: RootState) => state.auth);
  const { userMenuItems } = useUserMenuItems();

  if (!user) return null;

  return (
    <Dropdown
      variant="userNav"
      modal={false}
      trigger={
        <Button
          variant="ghost"
          className={`flex items-center gap-2 sm:gap-2.5 md:gap-3 px-1.5 sm:px-2 border-0! hover:bg-[var(--color-bg-hover)] min-w-0 ${className}`}
        >
          <Avatar
            alt={user.name}
            size="xs"
            variant="square"
            className="flex-shrink-0"
            fallback={
              <span className="flex h-full w-full items-center justify-center bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs font-semibold uppercase">
                {user.name.charAt(0).toUpperCase()}
              </span>
            }
          />
          <span className="text-[var(--color-text-primary)] text-xs sm:text-sm text-start hidden sm:block truncate">
            {user.name}
          </span>
        </Button>
      }
      items={userMenuItems}
      placement="bottom-right"
    />
  );
}

export default UserDropdown;
