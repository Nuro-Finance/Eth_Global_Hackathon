"use client";

import { useState, useRef, useEffect, memo } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  LayoutDashboard,
  LayoutPanelLeft,
  CreditCard,
  Wallet,
  Landmark,
  ArrowLeftRight,
  History,
  TrendingUp,
  PlusCircle,
  HelpCircle,
  Settings,
  ChevronRight,
  ChevronDown,
  Bot,
  ArrowRightLeft,
  Wallet2,
  Award,
  Home,
} from "lucide-react";
import { PolymarketNavIcon } from "@/components/icons/PolymarketNavIcon";
import { SidebarRailTooltip } from "@/components/SidebarRailTooltip";
import SidebarProfile from "./components/SidebarProfile";
import { DASHBOARD_HOME_RESPONSIVE_LAB_PATH } from "@/features/dashboard/responsive/constants";

function isSidebarNavActive(cleanPath: string, item: { id: string; href: string }): boolean {
  if (cleanPath === item.href) return true;
  if (item.id === "overview") {
    return (
      cleanPath === "/dashboard" ||
      cleanPath === DASHBOARD_HOME_RESPONSIVE_LAB_PATH ||
      cleanPath === "/dashboard-responsive"
    );
  }
  return false;
}

// Literal sub-component from original SidebarNavigation.tsx to handle soft transitions
const CollapsibleSection = memo(({ isExpanded, items, cleanPath, expanded, tooltipSide }: { isExpanded: boolean, items: any[], cleanPath: string, expanded: boolean, tooltipSide: "left" | "right" }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [items]);

  return (
    <div
      className="flex flex-col gap-1 overflow-hidden transition-[height] duration-300 ease-in-out"
      style={{ height: isExpanded ? height : 0 }}
    >
      <div ref={contentRef} className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = isSidebarNavActive(cleanPath, item);
          return (
            <SidebarRailTooltip
              key={item.id}
              collapsed={!expanded}
              label={item.label}
              side={tooltipSide}
              mode="rail-row"
            >
              <Link
                href={item.href}
                className={`group relative flex items-center h-[36px] w-full rounded-[var(--radius-sm)] transition-colors duration-200 ease-in-out`}
              >
                {/* 1:1 Industry Standard Hover Highlight */}
                <div
                  className={`
                  absolute left-0 top-0 h-[36px] transition-all duration-200 rounded-[var(--radius-sm)]
                  ${expanded ? "w-full" : "w-[36px] ml-0.5"}
                  ${isActive ? "bg-[var(--color-sidebar-item-hover)]" : "bg-transparent group-hover:bg-[var(--color-sidebar-item-hover-subtle)]"}
                `}
                />

                <div className={`relative z-10 flex items-center justify-center shrink-0 w-10 h-[36px] transition-colors duration-300 [&_svg]:w-5 [&_svg]:h-5 [&_svg]:[stroke-width:1.5px] ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)] group-hover:text-white"}`}>
                  {item.icon}
                </div>
                <span
                  className={`
                   relative z-10 text-[13px] font-medium whitespace-nowrap 
                   transition-[opacity,max-width,color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
                   overflow-hidden
                   ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)] group-hover:text-white"}
                   ${expanded ? 'opacity-100 max-w-[150px] ml-0' : 'opacity-0 max-w-0 ml-0 pointer-events-none'}
                `}
                >
                  {item.label}
                </span>
              </Link>
            </SidebarRailTooltip>
          );
        })}
      </div>
    </div>
  );
});

CollapsibleSection.displayName = "CollapsibleSection";

export default function SidebarProof({
  expanded,
  setExpanded,
  expandLocked = false,
}: {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
 /** sm: rail only - hide toggle, parent blocks expand */
  expandLocked?: boolean;
}) {
  const [openSections, setOpenSections] = useState<string[]>(['MAIN', 'CARDS', 'WALLET']);
  const pathname = usePathname();

  const toggle = () => {
    if (expandLocked) return;
    setExpanded(!expanded);
  };

  const toggleSection = (label: string) => {
    setOpenSections(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

 // Exact path detection
  const locale = pathname.split("/")[1] || "en";
  const cleanPath = pathname.replace(`/${locale}`, "") || "/dashboard";
  const tooltipSide = locale === "ar" ? "left" : "right";

  const sections = [
    {
      label: "MAIN",
      items: [
        { id: 'overview', label: 'Home', icon: <Home />, href: '/dashboard' },
      ]
    },
    {
      label: "CARDS",
      items: [
        { id: 'my-card', label: 'My Card', icon: <CreditCard />, href: '/dashboard/my-card-1' },
        { id: 'agent-cards', label: 'Agent Cards', icon: <Bot />, href: '/dashboard/agent-cards' },
        { id: 'transactions', label: 'Transactions', icon: <ArrowLeftRight />, href: '/dashboard/transactions' },
      ]
    },
    {
      label: "WALLET",
      items: [
        { id: 'my-wallet', label: 'My Wallet', icon: <Wallet />, href: '/dashboard/my-wallet' },
 // 2026-05-25 staging-only carve-out: Agent Wallet + Bank Vault don't
 // meet our FE standards yet - design team is going to redo them.
 // Visible on staging (NEXT_PUBLIC_DESIGN_PENDING_VISIBLE=true) so the
 // design team can see + iterate, hidden on prod by default. Routes
 // (/dashboard/agent-wallet + /dashboard/vault) still resolve so direct
 // URLs work in either env.
        ...(process.env.NEXT_PUBLIC_DESIGN_PENDING_VISIBLE === 'true' ? [
          { id: 'agent-wallet', label: 'Agent Wallet', icon: <Bot />, href: '/dashboard/agent-wallet' },
          { id: 'bank-vault', label: 'Bank Vault', icon: <Landmark />, href: '/dashboard/vault' },
        ] : []),
      ]
    },
 // YIELD section intentionally HIDDEN (Marathon 11 demo prep). Routes still
 // exist (Chris drop 5.23.26 Phase 1 added yield-agents / arena / markets pages)
 // but the sidebar entries are off until product is ready to surface them.
 // Re-enable: paste the block below back in this `sections` array AND add
 // 'YIELD' back to openSections useState (line 103) + the section-collapse
 // includes check (line 214).
 //
 // {
 // label: "YIELD",
 // items: [
 // { id: 'yield-agents', label: 'Yield Agents', icon: <TrendingUp />, href: '/dashboard/yield-agents' },
 // { id: 'arena', label: 'Prize Pool', icon: <Award className="w-5 h-5" />, href: '/dashboard/arena' },
 // { id: 'markets', label: 'Polymarket', icon: <PolymarketNavIcon className="!h-[25.3px] !w-[25.3px] shrink-0" />, href: '/dashboard/markets' },
 // ]
 // }
  ];

  return (
    <div
      className={`
        relative h-full bg-[var(--color-sidebar-bg)] rounded-2xl
        overflow-hidden
        transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${expanded ? 'w-[240px]' : 'w-[64px]'}
      `}
    >
      <aside className="flex flex-col h-full w-[240px] px-3 pb-3 pt-1 overflow-x-hidden">
        {/* Header: Sliding-Left Anchor Architecture (1:1 Token Restoration) */}
        <div className="mb-4 pt-4 relative h-[42px] w-full overflow-hidden shrink-0">
          {/* Logo - Static Anchor at original x=24px coordinate */}
          <div 
            className={`
              absolute top-1/2 -translate-y-1/2 left-[12px] transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
              ${expanded ? "opacity-100" : "opacity-0 pointer-events-none"}
            `}
          >
            <img
              src="/Nuro Horizontal Logo.svg"
              alt="Nuro Finance"
              className="h-[18px] w-auto"
            />
          </div>
          
          {/* Toggle - sm (expandLocked): visible, non-interactive */}
          <button
            type="button"
            onClick={expandLocked ? undefined : toggle}
            disabled={expandLocked}
            aria-disabled={expandLocked}
            className={`
               absolute top-1/2 -translate-y-1/2 flex items-center justify-center p-1
               transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
               ${expanded ? "left-[184px]" : "left-[8px]"}
               ${expandLocked ? "cursor-default opacity-40" : "group cursor-pointer"}
            `}
            aria-label={expandLocked ? "Sidebar collapsed" : "Toggle Sidebar"}
          >
            <div
              className={`w-4 h-4 rounded-[4px] border border-[var(--color-text-muted)] p-[1.5px] flex transition-all duration-200 ${
                expandLocked
                  ? "opacity-40"
                  : "opacity-40 group-hover:border-white group-hover:opacity-100"
              }`}
            >
              <div
                className={`w-[5px] h-full rounded-[1px] bg-[var(--color-text-muted)] ${
                  expandLocked ? "" : "group-hover:bg-white"
                }`}
              />
            </div>
          </button>
        </div>

        {/* Navigation Contents: 20px Gap Lock */}
        <div className="flex flex-col gap-5 flex-1 overflow-hidden pr-1 pb-4">
          {sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-1">
              {/* Section Header */}
              <div className="h-6 px-3 flex items-center justify-between">
                <span className={`text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-primary)] transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
                  {section.label}
                </span>
                {expanded && (
                  <div className="flex items-center gap-1.5">
                    {section.label === "MAIN" && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase">Live</span>
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] [animation:var(--animate-live-breathe)]" />
                      </div>
                    )}
                    {['CARDS', 'WALLET'].includes(section.label) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSection(section.label);
                        }}
                        className="flex items-center justify-center p-0.5 rounded hover:bg-[var(--color-sidebar-item-hover-subtle)] transition-colors"
                        aria-label={openSections.includes(section.label) ? "Collapse section" : "Expand section"}
                      >
                        {openSections.includes(section.label) ? (
                          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Section Items: Collapsible Section with Soft Transition */}
              <CollapsibleSection
 // Collapsed nav must always show all icons, regardless of drawer open/closed state.
                isExpanded={expanded ? openSections.includes(section.label) : true}
                items={section.items}
                cleanPath={cleanPath}
                expanded={expanded}
                tooltipSide={tooltipSide}
              />
            </div>
          ))}
        </div>

        {/* Profile - Fixed at bottom of the working container */}
        <div className="mt-auto pt-4 transition-opacity duration-300">
          <SidebarProfile collapsed={!expanded} />
        </div>
      </aside>
    </div>
  );
}
