"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DASHBOARD_SM_MAX_PX } from "@/features/dashboard/responsive/constants";
import { createPortal } from "react-dom";
import SidebarProof from "@/layouts/Sidebar/SidebarProof";
import Header from "@/layouts/Header";
import KycBanner from "@/features/dashboard/overview/components/KycBanner";
import ProtectedRoute from "@/features/auth/ProtectedRoute";
import WelcomeOnboardingGate from "@/features/auth/WelcomeOnboardingGate";
import { GlobalBackground } from "@/components/GlobalBackground";
import { AssistantChatPanelV2 } from "@/components/AssistantChatPanelV2";
import {
  ASSISTANT_CHAT_NAV_CHROME_GAP_PX,
  ASSISTANT_CHAT_NAV_RAIL_WIDTH_PX,
} from "@/components/chat/AssistantChatPanelNavRail";
import { AnimatePresence, motion } from "framer-motion";
import { DevPreviewModeProvider } from "@/providers/DevPreviewModeProvider";
import { revealScrollbarWhileScrolling } from "@/lib/scrollbarReveal";
import { cn } from "@/lib/utils";

/** motion.aside `p-[10px]` — one inset per side; nav↔chat gap uses the same value. */
const ASSISTANT_CHAT_ASIDE_INSET_PX = 10;
const ASSISTANT_CHAT_ASIDE_HORIZONTAL_PAD_PX = ASSISTANT_CHAT_ASIDE_INSET_PX * 2;
/** Max width of the whole chat drawer (nav + gap + chat column + aside padding). */
const ASSISTANT_CHAT_MAX_VIEWPORT_RATIO = 0.75;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isSmViewport, setIsSmViewport] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isChatV2Open, setIsChatV2Open] = useState(false);
  const [panelWidth, setPanelWidth] = useState(460);
  const [assistantResizeFake, setAssistantResizeFake] = useState<{
    show: boolean;
    x: number;
    y: number;
  }>({ show: false, x: 0, y: 0 });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(460);
  const chatV2ResizeHandleRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  /** Fresh document / refresh: allow the chat BYOK intro modal once before dismiss for this visit. */
  useEffect(() => {
    try {
      sessionStorage.removeItem("nuro.chat.byok.dismissedThisLayoutVisit");
    } catch {
      /* private mode / disabled storage */
    }
  }, []);

  const clearRootCursor = () => {
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";
  };

  const lockTextSelection = () => {
    const targets = [document.body, document.documentElement];
    const props = ["user-select", "-webkit-user-select", "-moz-user-select"] as const;
    for (const el of targets) {
      for (const p of props) {
        el.style.setProperty(p, "none", "important");
      }
    }
  };

  const unlockTextSelection = () => {
    const targets = [document.body, document.documentElement];
    const props = ["user-select", "-webkit-user-select", "-moz-user-select"] as const;
    for (const el of targets) {
      for (const p of props) {
        el.style.removeProperty(p);
      }
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!isDragging.current) return;
      e.preventDefault();
      setAssistantResizeFake((prev) => ({
        ...prev,
        show: true,
        x: e.clientX,
        y: e.clientY,
      }));
      const delta = startX.current - e.clientX;
      const maxMainWidth = Math.max(
        360,
        Math.floor(window.innerWidth * ASSISTANT_CHAT_MAX_VIEWPORT_RATIO) -
          ASSISTANT_CHAT_NAV_RAIL_WIDTH_PX -
          ASSISTANT_CHAT_NAV_CHROME_GAP_PX -
          ASSISTANT_CHAT_ASIDE_HORIZONTAL_PAD_PX
      );
      const newWidth = Math.min(maxMainWidth, Math.max(360, startWidth.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      clearRootCursor();
      unlockTextSelection();
      const { x, y } = lastPointerRef.current;
      const handle = chatV2ResizeHandleRef.current;
      if (!handle) {
        setAssistantResizeFake({ show: false, x: 0, y: 0 });
        return;
      }
      const r = handle.getBoundingClientRect();
      const over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      setAssistantResizeFake(over ? { show: true, x, y } : { show: false, x: 0, y: 0 });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseUp);
    };
  }, []);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setAssistantResizeFake({ show: true, x: e.clientX, y: e.clientY });
    clearRootCursor();
    lockTextSelection();
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  /** sm (&lt;768): rail only — collapsed by default, expand blocked */
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${DASHBOARD_SM_MAX_PX}px)`);
    const sync = () => {
      const sm = mq.matches;
      setIsSmViewport(sm);
      if (sm) setIsSidebarExpanded(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const setSidebarExpanded = useCallback(
    (next: boolean) => {
      if (typeof window !== "undefined" && window.innerWidth <= DASHBOARD_SM_MAX_PX && next) {
        return;
      }
      setIsSidebarExpanded(next);
    },
    [],
  );

  /** Scrollport loses width to the bar; header does not — expand page content to match wallet. */
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;

    const syncScrollbarLane = () => {
      const lane = Math.max(0, el.offsetWidth - el.clientWidth);
      document.documentElement.style.setProperty(
        "--dashboard-scrollbar-lane",
        `${lane}px`,
      );
    };

    syncScrollbarLane();
    const ro = new ResizeObserver(syncScrollbarLane);
    ro.observe(el);
    window.addEventListener("resize", syncScrollbarLane);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncScrollbarLane);
      document.documentElement.style.removeProperty("--dashboard-scrollbar-lane");
    };
  }, [mounted]);

  useEffect(() => {
    const openChatV2 = () => setIsChatV2Open(true);
    window.addEventListener("nuro:open-chat-v2", openChatV2);
    return () => window.removeEventListener("nuro:open-chat-v2", openChatV2);
  }, []);

  useEffect(() => {
    if (!isChatV2Open) {
      setAssistantResizeFake({ show: false, x: 0, y: 0 });
    }
  }, [isChatV2Open]);

  if (!mounted) {
    return (
      <div className="h-screen w-screen bg-[#111111] relative overflow-hidden" />
    );
  }

  // MATHEMATICAL MIRROR CONSTANTS
  const sidebarExpanded = isSmViewport ? false : isSidebarExpanded;
  const sidebarWidth = sidebarExpanded ? 240 : 64;
  const contentOffset = 16 + sidebarWidth; // Exact Sidebar Edge (shell + nav)

  return (
    <ProtectedRoute>
      <WelcomeOnboardingGate>
      <DevPreviewModeProvider>
      <div className="h-screen w-screen overflow-hidden bg-transparent relative">
        {/* Layer 0: Global Viewport Lock */}
        <style jsx global>{`
          html, body {
            height: 100% !important;
            width: 100% !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            scrollbar-gutter: auto !important;
          }
          /* Scrollport pinned viewport-right; 32px pad is on .dashboard-main-scroll-pad only */
          .dashboard-main-scroll {
            position: absolute !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            left: 2rem !important;
            width: auto !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            scrollbar-gutter: auto !important;
          }
        `}</style>

        <GlobalBackground />

        {/* 
            VERTICAL NAV ANCHOR 
        */}
        <aside
          className="fixed left-4 top-4 bottom-4 z-[50] transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden"
          style={{ width: `${sidebarWidth}px` }}
        >
          <SidebarProof
            expanded={sidebarExpanded}
            setExpanded={setSidebarExpanded}
            expandLocked={isSmViewport}
          />
        </aside>

        {/* 
            HORIZONTAL NAV ANCHOR 
            Removed initial p-4 shell to align flush with content baseline.
        */}
        {/* Solid plate ABOVE the toolbar (covers the mt-4 gap) */}
        <div
          className="fixed top-0 right-0 z-[39] h-4 pointer-events-none bg-[var(--color-bg-primary)]"
          style={{ left: `${contentOffset}px` }}
          aria-hidden
        />
        {/* Rounded corner caps ABOVE the toolbar (match rounded-2xl = 16px) */}
        <div
          className="fixed top-4 z-[39] pointer-events-none"
          style={{ left: `calc(${contentOffset}px + 32px)` }}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              fill="var(--color-bg-primary)"
              fillRule="evenodd"
              d="M0 0H16V16H0V0ZM16 0A16 16 0 0 0 0 16H16V0Z"
            />
          </svg>
        </div>
        <div
          className="fixed top-4 right-0 z-[39] pointer-events-none"
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              fill="var(--color-bg-primary)"
              fillRule="evenodd"
              d="M0 0H16V16H0V0ZM16 0A16 16 0 0 0 0 16H16V0Z"
              transform="translate(16 0) scale(-1 1)"
            />
          </svg>
        </div>
        <header
          className="fixed top-0 right-0 z-[40] pointer-events-none transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ left: `${contentOffset}px` }}
        >
          <div className="pointer-events-auto mt-4 box-border w-full px-8">
            <div className="w-full h-12 flex items-center bg-white/0 backdrop-blur-xl border border-transparent rounded-2xl">
              <Header
                scrolled={scrolled}
                onChatV2Toggle={() => setIsChatV2Open(!isChatV2Open)}
              />
            </div>
          </div>
        </header>

        {/* 
            THE CONTENT MIRROR 
        */}
        <main
          className={cn(
            "fixed top-0 bottom-0 right-0 z-[10] overflow-hidden transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            isChatV2Open && "pointer-events-none",
          )}
          style={{ left: `${contentOffset}px` }}
        >
          <div
            ref={mainScrollRef}
            onScroll={(e) => {
              revealScrollbarWhileScrolling(e.currentTarget);
              const scrollTop = e.currentTarget.scrollTop;
              if (scrollTop > 10 && !scrolled) setScrolled(true);
              if (scrollTop <= 10 && scrolled) setScrolled(false);
            }}
            className={cn(
              "dashboard-main-scroll scroll-fade-mask scrollbar-autohide pointer-events-auto overflow-x-hidden overflow-y-auto scroll-smooth [overflow-anchor:none]",
            )}
          >
            {/* 32px right pad on content — scrollport right edge = viewport (bar in that band) */}
            <div
              className="dashboard-main-scroll-pad mt-[5.5rem] box-border space-y-8 pb-[var(--scroll-fade-bottom-content-pad)]"
              style={{
                paddingRight: 32,
                width: "calc(100% + var(--dashboard-scrollbar-lane, 0px))",
                maxWidth: "calc(100% + var(--dashboard-scrollbar-lane, 0px))",
              }}
            >
              <KycBanner />
              {children}
            </div>
          </div>
        </main>

        {/* Nuro AI chat (V2) */}
        <AnimatePresence>
          {isChatV2Open && (
            <>
              <motion.div
                key="chat-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-[90] xl:bg-black/20"
                onClick={() => setIsChatV2Open(false)}
              />

              <motion.aside
                key="chat-v2-aside"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-y-4 right-4 z-[100] flex min-h-0 flex-col overflow-hidden rounded-[34px] border border-white/5 bg-transparent p-[10px]"
                style={{
                  width: `${panelWidth + ASSISTANT_CHAT_NAV_RAIL_WIDTH_PX + ASSISTANT_CHAT_NAV_CHROME_GAP_PX + ASSISTANT_CHAT_ASIDE_HORIZONTAL_PAD_PX}px`,
                  maxWidth: `${ASSISTANT_CHAT_MAX_VIEWPORT_RATIO * 100}vw`,
                  minWidth: `${360 + ASSISTANT_CHAT_NAV_RAIL_WIDTH_PX + ASSISTANT_CHAT_NAV_CHROME_GAP_PX + ASSISTANT_CHAT_ASIDE_HORIZONTAL_PAD_PX}px`,
                }}
              >
                <div
                  className="absolute -inset-[10px] rounded-[inherit] -z-10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] bg-[#141414]/30 border border-white/5"
                  style={{ backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)" }}
                />
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <AssistantChatPanelV2 onClose={() => setIsChatV2Open(false)} />
                </div>
                <div
                  ref={chatV2ResizeHandleRef}
                  onMouseDown={onDragStart}
                  onMouseEnter={(e) => {
                    if (isDragging.current) return;
                    lastPointerRef.current = { x: e.clientX, y: e.clientY };
                    setAssistantResizeFake({ show: true, x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => {
                    lastPointerRef.current = { x: e.clientX, y: e.clientY };
                    setAssistantResizeFake({ show: true, x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => {
                    if (!isDragging.current) {
                      setAssistantResizeFake({ show: false, x: 0, y: 0 });
                    }
                  }}
                  className="group/drag pointer-events-auto absolute left-0 top-0 bottom-0 z-[5000] w-2 cursor-none select-none touch-none"
                  style={{ touchAction: "none" }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-primary)]/50 opacity-0 transition-opacity duration-200 group-hover/drag:opacity-100" />
                </div>
              </motion.aside>

              {mounted &&
                assistantResizeFake.show &&
                createPortal(
                  <div
                    className="pointer-events-none"
                    style={{
                      position: "fixed",
                      left: assistantResizeFake.x,
                      top: assistantResizeFake.y,
                      transform: "translate(-50%, -50%)",
                      zIndex: 2147483647,
                    }}
                    aria-hidden
                  >
                    <img
                      src="/Drag Cursor - Updated.svg"
                      width={34}
                      height={24}
                      alt=""
                      aria-hidden
                      className="rounded-2xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
                      draggable={false}
                    />
                  </div>,
                  document.body
                )}
            </>
          )}
        </AnimatePresence>
      </div>
      </DevPreviewModeProvider>
      </WelcomeOnboardingGate>
    </ProtectedRoute>
  );
}
