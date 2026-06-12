import { cn } from "@/lib/utils";

/** My Card controls: inputs and icon actions without outer strokes. */
export const MY_CARD_INNER_INPUT_CLASS = cn(
  "!border-none shadow-none outline-none",
  "focus:!border-transparent focus:ring-0 focus-visible:ring-0",
);

export const MY_CARD_INNER_ICON_BUTTON_CLASS = "border-none shadow-none";

export const MY_CARD_INNER_TILE_CLASS = "!border-none border-transparent";
