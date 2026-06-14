"use client";

import { memo } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { SidebarLogoProps } from "../types";

const SidebarLogo = memo<SidebarLogoProps>(function SidebarLogo({
  collapsed = false,
}) {
  return (
    <Link
      href="/dashboard"
      className={`
        flex items-center justify-center
        ${
          collapsed
            ? "w-[30px] h-[30px] sm:w-[35px] sm:h-[35px] mb-4 sm:mb-6"
            : "w-[34px] h-[34px] sm:w-[40px] sm:h-[40px] mb-4 sm:mb-5"
        }
      `}
      aria-label="Go to Home"
    >
      <div className="relative logo w-full h-full">
        <Image
          src="/assets/images/icons/logo.svg"
          alt="Logo"
          fill
          priority
          className="object-contain dark:brightness-100 brightness-50"
        />
      </div>
    </Link>
  );
});

export default SidebarLogo;
