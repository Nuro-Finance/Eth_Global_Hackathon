"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  Apple,
  Clock3,
  Dog,
  Grid3X3,
  Heart,
  Lightbulb,
  Smile,
  Users,
} from "lucide-react";
import { HEADER_DROPDOWN_SIDE_OFFSET_PX } from "@/components/ui/dropdown-menu";
import {
  COMPACT_GLASS_SHELL_INNER_CLASS,
  COMPACT_GLASS_SHELL_INNER_STYLE,
  COMPACT_GLASS_SHELL_OUTER_CLASS,
  COMPACT_GLASS_SHELL_OUTER_STYLE,
} from "@/components/ui/modalPresets";
import { SETTINGS_INPUT_CLASS } from "@/features/dashboard/settings/settingsStyles";
import { useClickOutside } from "@/layouts/Header/components/NotificationsDropdown/hooks/useClickOutside";
import { searchEmojis } from "@/lib/emojiSearch";
import { cn } from "@/lib/utils";

type EmojiCategoryId =
  | "recent"
  | "all"
  | "smileys"
  | "people"
  | "animals"
  | "food"
  | "objects"
  | "symbols";

const EMOJI_CATEGORIES: {
  id: Exclude<EmojiCategoryId, "all">;
  label: string;
  icon: typeof Smile;
  emojis: string[];
}[] = [
  {
    id: "recent",
    label: "Recent",
    icon: Clock3,
    emojis: ["👋", "😀", "🔥", "💰", "🚀", "❤️", "😎", "✨"],
  },
  {
    id: "smileys",
    label: "Smileys",
    icon: Smile,
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚", "😙", "🥲", "😋", "😛",
      "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐",
      "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔",
      "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵",
      "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "🫤", "😟", "🙁", "☹️",
      "😮", "😯", "😲", "😳", "🥺", "🥹", "😦", "😧", "😨", "😰", "😥", "😢",
      "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠",
    ],
  },
  {
    id: "people",
    label: "People",
    icon: Users,
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏",
      "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️",
      "🫵", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲",
      "🤝", "🙏", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "👀",
      "👁️", "👅", "👄", "💋", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "👩",
      "🧔", "🧓", "👴", "👵", "🙍", "🙎", "🙅", "🙆", "💁", "🙋", "🧏", "🙇",
      "🤦", "🤷", "🧑‍💻", "👮", "🕵️", "💂", "🥷", "👷", "🫅", "🤴", "👸", "👳",
    ],
  },
  {
    id: "animals",
    label: "Animals",
    icon: Dog,
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁",
      "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦",
      "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝",
      "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️",
      "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡",
      "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧",
    ],
  },
  {
    id: "food",
    label: "Food",
    icon: Apple,
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒",
      "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️",
      "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖",
      "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🌭",
      "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘",
      "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘",
      "☕", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🍸", "🍹",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    icon: Lightbulb,
    emojis: [
      "⌚", "📱", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "💾", "💿", "📷", "📸", "📹",
      "🎥", "📞", "☎️", "📺", "📻", "🎙️", "⏰", "⏱️", "⏲️", "🔋", "🔌", "💡",
      "🔦", "🕯️", "💰", "💴", "💵", "💶", "💷", "💸", "💳", "🧾", "💎", "⚖️",
      "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🔩", "⚙️", "🧰", "🔫", "💣", "🧨", "🔪",
      "🏺", "🔮", "📿", "🧿", "💈", "⚗️", "🔭", "🔬", "🩹", "💊", "💉", "🩺",
      "🚪", "🛏️", "🛋️", "🪑", "🚽", "🚿", "🛁", "🧴", "🧷", "🧹", "🧺", "🧻",
      "🎁", "🎈", "🎏", "🎀", "🎊", "🎉", "🎎", "🏮", "🎐", "🧧", "✉️", "📩",
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    icon: Heart,
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹",
      "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️",
      "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌",
      "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️",
      "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚", "💮", "🉐", "㊙️",
      "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆎", "🆑", "🅾️", "🆘", "❌",
      "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️", "🚷", "🚯", "🚳", "🚱",
      "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️",
      "⚠️", "🚸", "🔱", "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎",
      "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧", "🚾", "♿", "🅿️", "🛗", "🈳", "🈂️",
      "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "⚧️", "🚻", "🚮", "🎦", "📶",
      "🔥", "✨", "⭐", "🌟", "💫", "⚡", "☄️", "💥", "🌈", "☀️", "🌤️", "⛅",
    ],
  },
];

const ALL_EMOJIS = [
  ...new Set(
    EMOJI_CATEGORIES.filter((category) => category.id !== "recent").flatMap(
      (category) => category.emojis,
    ),
  ),
];

const CATEGORY_TABS: {
  id: EmojiCategoryId;
  label: string;
  icon: typeof Smile;
}[] = [
  { id: "recent", label: "Recent", icon: Clock3 },
  { id: "all", label: "All", icon: Grid3X3 },
  ...EMOJI_CATEGORIES.filter((category) => category.id !== "recent").map(
    ({ id, label, icon }) => ({ id, label, icon }),
  ),
];

const emojiPanelClassName = cn(
  "z-[100] flex flex-col w-[20rem] sm:w-[22.5rem] max-w-[calc(100vw-2rem)]",
  COMPACT_GLASS_SHELL_OUTER_CLASS,
  "!backdrop-blur-[var(--glass-blur-modal)] backdrop-saturate-[1.35]",
);

const emojiPanelInnerStyle = {
  ...COMPACT_GLASS_SHELL_INNER_STYLE,
  backgroundColor: "rgba(255, 255, 255, 0.03)",
};

type GreetingEmojiPickerProps = {
  emoji: string;
  onSelect: (emoji: string) => void;
};

export function GreetingEmojiPicker({ emoji, onSelect }: GreetingEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EmojiCategoryId>("smileys");
  const [recent, setRecent] = useState<string[]>(["👋", "😀", "🔥", "💰", "🚀", "❤️"]);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(320);

  const activeEmojis = useMemo(() => {
    const q = query.trim();
    if (q) return searchEmojis(q, ALL_EMOJIS);
    if (category === "recent") return recent;
    if (category === "all") return ALL_EMOJIS;
    return EMOJI_CATEGORIES.find((item) => item.id === category)?.emojis ?? ALL_EMOJIS;
  }, [category, query, recent]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const fallbackWidth = window.matchMedia("(min-width: 640px)").matches ? 360 : 320;
    const panelWidth = panel?.getBoundingClientRect().width || fallbackWidth;
    const viewportPad = 8;
    const top = triggerRect.bottom + HEADER_DROPDOWN_SIDE_OFFSET_PX;
    const left = triggerRect.left;
    const clampedLeft = Math.min(
      Math.max(viewportPad, left),
      window.innerWidth - panelWidth - viewportPad,
    );

    setCoords({ top, left: clampedLeft });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const sync = () => updatePosition();
    sync();
    const raf = requestAnimationFrame(sync);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    const panel = panelRef.current;
    const ro =
      panel && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(sync)
        : null;
    ro?.observe(panel);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      ro?.disconnect();
    };
  }, [open, updatePosition]);

  const outsideClickRefs = useMemo(
    () => [containerRef, panelRef] as RefObject<HTMLElement | null>[],
    [],
  );

  useClickOutside(outsideClickRefs, open, close);

  useLayoutEffect(() => {
    if (!open || !gridRef.current) return;
    const next = Math.min(gridRef.current.scrollHeight, 320);
    setViewportHeight(next);
  }, [open, activeEmojis]);

  const handleSelect = (next: string) => {
    setRecent((prev) => [next, ...prev.filter((item) => item !== next)].slice(0, 24));
    onSelect(next);
    close();
  };

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className={emojiPanelClassName}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              ...COMPACT_GLASS_SHELL_OUTER_STYLE,
            }}
            role="dialog"
            aria-label="Choose greeting emoji"
          >
            <div className={COMPACT_GLASS_SHELL_INNER_CLASS} style={emojiPanelInnerStyle}>
              <div className="px-4 pt-4 pb-3">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className={cn(
                    SETTINGS_INPUT_CLASS,
                    "!border-transparent focus:!border-transparent focus-visible:!border-transparent focus:ring-0 focus-visible:ring-0",
                  )}
                />
              </div>

              <div className="flex items-center justify-between gap-0.5 px-4 pb-3">
                {CATEGORY_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    onClick={() => {
                      setCategory(id);
                      setQuery("");
                    }}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-colors",
                      category === id && !query
                        ? "bg-white/10 text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                ))}
              </div>

              <div
                className="overflow-hidden px-4 pb-4 transition-[height] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]"
                style={{ height: viewportHeight }}
              >
                <div
                  ref={gridRef}
                  className="max-h-[320px] overflow-y-auto overflow-x-hidden"
                >
                  <div className="grid w-full grid-cols-8 gap-0.5">
                    {activeEmojis.map((item, index) => (
                      <button
                        key={`${item}-${index}`}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[22px] leading-none transition-colors hover:bg-white/10"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <span ref={containerRef} className="inline">
      <button
        ref={triggerRef}
        type="button"
        className="inline cursor-pointer rounded-sm px-0.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30"
        aria-label="Change greeting emoji"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          updatePosition();
          setOpen(true);
        }}
      >
        {emoji}
      </button>
      {panel}
    </span>
  );
}
