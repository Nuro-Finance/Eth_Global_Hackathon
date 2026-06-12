"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { Home, ChevronRight } from "lucide-react";
import { sidebarNavigationConfig, NAVIGATION_ROUTES } from "../../Sidebar/config/navigation.config";

/**
 * Breadcrumbs component for the toolbar
 * Dynamically generates breadcrumbs based on the current pathname
 */
export function Breadcrumbs({ scrolled = false }: { scrolled?: boolean }) {
  const pathname = usePathname();

 // next-intl pathname is locale-free (e.g. /dashboard/overview-2)
  const cleanPath =
    typeof pathname === "string" && pathname.startsWith("/")
      ? pathname
      : "/dashboard";
  
 // Split path into segments and filter out empty ones
  const segments = cleanPath.split("/").filter(Boolean);
  
 // /dashboard is now the primary Overview page.
  if (
    segments.length === 0 ||
    (segments.length === 1 && segments[0]!.toLowerCase() === "dashboard")
  ) {
    return (
      <div
        className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-primary)] transition-all duration-350 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          transform: scrolled ? "translateX(12px)" : "translateX(0)",
        }}
      >
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        <span>Home</span>
      </div>
    );
  }

 // Generate breadcrumb trail
  const breadcrumbTrail = [];
  let currentPath = "";

 // Always start with Home
  breadcrumbTrail.push({
    label: "Home",
    href: NAVIGATION_ROUTES.DASHBOARD,
    icon: <Home className="w-3.5 h-3.5" />,
    isLast: false
  });

 // For dashboard apps, often "dashboard" is a parent segment we can ignore or group
 // But let's build it dynamically from the config
  
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    
 // Skip the "dashboard" segment if it's the first one, as "Home" covers it
    if (segment.toLowerCase() === "dashboard" && index === 0) return;

 // Find label from sidebar config
    const configItem = sidebarNavigationConfig.find(item => item.href === currentPath || item.href.includes(currentPath));
    
 // If not found in config, try to capitalize the segment
    let label = configItem ? configItem.labelKey : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
    
 // Specific overrides for overview variants
    if (segment === "overview-2" || segment === "overview-3" || segment === "dashboard") {
      label = "Home";
    }

 // Match product casing for specific routes
    if (!configItem && segment === "my-wallet") label = "My Wallet";

 // Handle "Cards" parent label for My Card pages if needed
 // In this specific dashboard, "My Card" is under "CARDS" section
    if (segment === "my-card" || segment === "my-card-v2" || segment === "agent-cards") {
 // We can optionally add "Cards" as a parent if it's not already there
 // But let's stick to the segments for now to keep it simple and clean
    }

    breadcrumbTrail.push({
      label: label,
      href: currentPath,
      isLast: index === segments.length - 1
    });
  });

  return (
    <nav 
      aria-label="Breadcrumb" 
      className="flex items-center gap-1.5 overflow-hidden transition-all duration-350 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ 
        transform: scrolled ? "translateX(12px)" : "translateX(0)" 
      }}
    >
      {breadcrumbTrail.map((crumb, i) => (
        <div key={crumb.href} className="flex items-center gap-1.5 shrink-0">
          <Link
            href={crumb.href}
            className={`flex items-center gap-1.5 text-[13px] transition-[opacity,transform] hover:text-[var(--color-text-primary)] ${
              crumb.isLast 
                ? "font-semibold text-[var(--color-text-primary)] cursor-default pointer-events-none" 
                : "font-medium text-[var(--color-text-muted)]"
            }`}
          >
            {crumb.icon && crumb.icon}
            <span className="truncate max-w-[120px]">{crumb.label}</span>
          </Link>
          {!crumb.isLast && (
            <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
          )}
        </div>
      ))}
    </nav>
  );
}
