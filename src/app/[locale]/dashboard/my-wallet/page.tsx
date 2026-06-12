"use client";

import dynamic from "next/dynamic";

const Wallet1Feature = dynamic(
  () => import("@/features/dashboard/my-wallet"),
  { ssr: false }
);

export default function Wallet1Page() {
  return <Wallet1Feature />;
}
