"use client";

import dynamic from "next/dynamic";
import { DashboardResponsivePage } from "@/features/dashboard/responsive";
import HomeResponsiveSm from "./HomeResponsiveSm";

const HomeResponsiveMd1 = dynamic(() => import("./HomeResponsiveMd1"), { ssr: false });
const HomeResponsiveMd2 = dynamic(() => import("./HomeResponsiveMd2"), { ssr: false });
const HomeResponsiveMd3 = dynamic(() => import("./HomeResponsiveMd3"), { ssr: false });
const HomeResponsiveXl = dynamic(() => import("./HomeResponsiveXl"), { ssr: false });

export function HomeResponsiveLab() {
  return (
    <DashboardResponsivePage
      sm={<HomeResponsiveSm />}
      md1={<HomeResponsiveMd1 />}
      md2={<HomeResponsiveMd2 />}
      md3={<HomeResponsiveMd3 />}
      xl={<HomeResponsiveXl />}
    />
  );
}
