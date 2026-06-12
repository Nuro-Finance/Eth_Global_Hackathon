import { ComponentType } from "react";
import GoogleGMark from "./GoogleGMark";

export interface SocialProvider {
    id: string;
    name: string;
    icon: ComponentType<{ className?: string }>;
 /** Extra classes on the icon (e.g. `text-*`). Omit for multicolor SVGs like Google. */
    iconClassName?: string;
}

export const SOCIAL_PROVIDERS: SocialProvider[] = [
    {
        id: "google",
        name: "Google",
        icon: GoogleGMark,
    },
];
