"use client";

import Image from "next/image";

/** White app tile + black Nuro mark for login headers. */
export function LoginBrandMark() {
  return (
    <div className="inline-flex items-center justify-center w-14 h-14 bg-white rounded-2xl mb-4 shadow-lg p-2 ring-1 ring-black/[0.06] dark:ring-white/15">
      <Image
        src="/nuro-logo-black.svg"
        alt=""
        width={1344}
        height={1057}
        className="h-[1.7rem] w-auto max-w-full object-contain object-center"
        priority
      />
    </div>
  );
}
