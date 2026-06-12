"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { IconLayoutSidebar } from "@tabler/icons-react";
import SidebarItem from "./SidebarItem";
import {
  sidebarSectionsConfig,
  getNavItemById,
  SidebarSectionId,
} from "../config/navigation.config";

interface SidebarNavigationProps {
  collapsed: boolean;
  pathname: string;
  locale: string;
  isRTL: boolean;
}

interface CollapsibleSectionProps {
  sectionId: SidebarSectionId;
  isExpanded: boolean;
  collapsed: boolean;
  items: ReturnType<typeof getNavItemById>[];
  cleanPath: string;
  isRTL: boolean;
}

const CollapsibleSection = memo<CollapsibleSectionProps>(
  function CollapsibleSection({ sectionId, isExpanded, collapsed, items, cleanPath, isRTL }) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);

    useEffect(() => {
      if (contentRef.current) {
        setHeight(contentRef.current.scrollHeight);
      }
    }, [items]);

    if (collapsed) {
      return (
        <>
          {items.map((item) => (
            <SidebarItem
              key={item!.id}
              id={item!.id}
              icon={item!.icon}
              label={item!.labelKey}
              tooltip={item!.tooltipKey}
              href={item!.href}
              collapsed={collapsed}
              isActive={cleanPath === item!.href}
              tooltipPosition={isRTL ? "left" : "right"}
            />
          ))}
        </>
      );
    }

    return (
      <div
        className="flex flex-col gap-0.5 overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: isExpanded ? height : 0 }}
      >
        <div ref={contentRef} className="flex flex-col gap-0.5">
          {items.map((item) => (
            <SidebarItem
              key={item!.id}
              id={item!.id}
              icon={item!.icon}
              label={item!.labelKey}
              tooltip={item!.tooltipKey}
              href={item!.href}
              collapsed={collapsed}
              isActive={cleanPath === item!.href}
              tooltipPosition={isRTL ? "left" : "right"}
            />
          ))}
        </div>
      </div>
    );
  }
);

const COLLAPSIBLE_SECTIONS: SidebarSectionId[] = ["cards", "wallet", "yield"];

const SidebarNavigation = memo<SidebarNavigationProps>(
  function SidebarNavigation({ collapsed, pathname, locale, isRTL }) {
    const cleanPath = pathname.replace(`/${locale}`, "") || "/dashboard";

    const [expandedSections, setExpandedSections] = useState<Record<SidebarSectionId, boolean>>({
      main: true,
      cards: true,
      wallet: true,
      yield: true,
      demos: true,
    });

    useEffect(() => {
      const saved = localStorage.getItem("sidebar_sections_expanded");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setExpandedSections(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error("Failed to parse sidebar_sections_expanded", e);
        }
      }
    }, []);

    const toggleSection = useCallback((sectionId: SidebarSectionId) => {
      setExpandedSections((prev) => {
        const next = { ...prev, [sectionId]: !prev[sectionId] };
        localStorage.setItem("sidebar_sections_expanded", JSON.stringify(next));
        return next;
      });
    }, []);

    const isCollapsible = (sectionId: SidebarSectionId) => COLLAPSIBLE_SECTIONS.includes(sectionId);

    return (
      <nav className={`flex flex-col flex-1 min-h-0 w-full ${collapsed ? "px-1" : "px-3"}`}>
        {/* Sidebar Header: Always visible to allow toggle */}
        <div className={`mb-5 pt-4 flex items-center ${collapsed ? "justify-center" : "justify-between px-3"}`}>
          {!collapsed && (
            <div className="flex items-center">
              <img
                src="/Nuro Horizontal Logo.svg"
                alt="Nuro Finance"
                className="h-[18px] w-auto"
              />
            </div>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("sidebar-toggle"))}
            className={`group flex items-center justify-center p-1 ${!collapsed ? 'translate-x-1' : ''}`}
            aria-label="Toggle Sidebar"
          >
            <div className="w-4 h-4 rounded-[4px] border border-[var(--color-text-muted)] group-hover:border-[var(--color-text-primary)] p-[1.5px] flex transition-all duration-200 opacity-40 group-hover:opacity-100">
              <div className="w-[5px] h-full bg-[var(--color-text-muted)] group-hover:bg-[var(--color-text-primary)] rounded-[1px] transition-all duration-200" />
            </div>
          </button>
        </div>

        {(["main", "cards", "wallet", "yield"] as const).map(
          (sectionId) => {
            const section = sidebarSectionsConfig[sectionId];
            const items = section.itemIds
              .map((id) => getNavItemById(id))
              .filter(Boolean);
            if (!items.length) return null;
            return (
              <div key={sectionId} className={collapsed ? "mb-4" : "mb-6"}>
                {!collapsed && (
                  <div className="mb-2 flex items-center justify-between px-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#ffffff]">
                      {section.label}
                    </p>
                    {sectionId === "main" && (
                      <span className="flex items-center gap-1.5" aria-label="Live">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          Live
                        </span>
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] [animation:var(--animate-live-breathe)]" />
                      </span>
                    )}
                    {isCollapsible(sectionId) && (
                      <button
                        onClick={() => toggleSection(sectionId)}
                        className="flex items-center justify-center p-0.5 rounded hover:bg-[var(--color-sidebar-item-hover)] transition-[opacity,transform]"
                        aria-label={expandedSections[sectionId] ? "Collapse section" : "Expand section"}
                      >
                        {expandedSections[sectionId] ? (
                          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        )}
                      </button>
                    )}
                  </div>
                )}
                <CollapsibleSection
                  sectionId={sectionId}
                  isExpanded={expandedSections[sectionId]}
                  collapsed={collapsed}
                  items={items}
                  cleanPath={cleanPath}
                  isRTL={isRTL}
                />
              </div>
            );
          }
        )}
      </nav>
    );
  }
);

export default SidebarNavigation;
