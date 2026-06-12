"use client";

import { useEffect, RefObject } from "react";

type RefTarget = RefObject<HTMLElement | null>;

function isOutsideAll(refs: RefTarget[], target: Node) {
  return !refs.some((r) => r.current?.contains(target));
}

/**
 * Hook to detect clicks outside one or more referenced elements (e.g. trigger + portaled panel).
 */
export function useClickOutside(
  refOrRefs: RefTarget | RefTarget[],
  isActive: boolean,
  onClickOutside: () => void
) {
  useEffect(() => {
    const refs = Array.isArray(refOrRefs) ? refOrRefs : [refOrRefs];

    function handleClickOutside(event: MouseEvent) {
      if (isOutsideAll(refs, event.target as Node)) {
        onClickOutside();
      }
    }

    if (isActive) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [refOrRefs, isActive, onClickOutside]);
}
