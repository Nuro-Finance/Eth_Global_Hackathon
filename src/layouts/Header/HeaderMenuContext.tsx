"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type HeaderMenuId = "language" | "notifications" | "wallet";

type HeaderMenuContextValue = {
  openMenuId: HeaderMenuId | null;
  openMenu: (id: HeaderMenuId) => void;
  closeMenu: () => void;
  toggleMenu: (id: HeaderMenuId) => void;
};

const HeaderMenuContext = createContext<HeaderMenuContextValue | null>(null);

export function HeaderMenuProvider({ children }: { children: ReactNode }) {
  const [openMenuId, setOpenMenuId] = useState<HeaderMenuId | null>(null);

  const openMenu = useCallback((id: HeaderMenuId) => {
    setOpenMenuId(id);
  }, []);

  const closeMenu = useCallback(() => {
    setOpenMenuId(null);
  }, []);

  const toggleMenu = useCallback((id: HeaderMenuId) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  }, []);

  const value = useMemo(
    () => ({ openMenuId, openMenu, closeMenu, toggleMenu }),
    [openMenuId, openMenu, closeMenu, toggleMenu]
  );

  return (
    <HeaderMenuContext.Provider value={value}>
      {children}
    </HeaderMenuContext.Provider>
  );
}

export function useHeaderMenu() {
  return useContext(HeaderMenuContext);
}
