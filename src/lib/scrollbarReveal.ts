const scrollRevealIdleTimers = new WeakMap<HTMLElement, number>();
const scrollRevealCooldownTimers = new WeakMap<HTMLElement, number>();

export const SCROLLBAR_REVEAL_IDLE_MS = 700;
export const SCROLLBAR_REVEAL_FADE_MS = 400;

/** Show scrollbar only while scrolling; soft 400ms fade, no hover flash or stray scroll bounce. */
export function revealScrollbarWhileScrolling(
  el: HTMLElement,
  idleMs = SCROLLBAR_REVEAL_IDLE_MS
): void {
  if (el.dataset.scrollbarRevealCooldown === "1") return;

  el.classList.add("is-scrolling");

  const prev = scrollRevealIdleTimers.get(el);
  if (prev !== undefined) window.clearTimeout(prev);

  scrollRevealIdleTimers.set(
    el,
    window.setTimeout(() => {
      el.classList.remove("is-scrolling");
      scrollRevealIdleTimers.delete(el);

      el.dataset.scrollbarRevealCooldown = "1";
      const cooldown = scrollRevealCooldownTimers.get(el);
      if (cooldown !== undefined) window.clearTimeout(cooldown);
      scrollRevealCooldownTimers.set(
        el,
        window.setTimeout(() => {
          delete el.dataset.scrollbarRevealCooldown;
          scrollRevealCooldownTimers.delete(el);
        }, SCROLLBAR_REVEAL_FADE_MS)
      );
    }, idleMs)
  );
}
