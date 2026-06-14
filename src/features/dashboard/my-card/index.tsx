"use client";

import { PageHeader, PageTitle } from "@/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    UserCheck,
    FileText,
    ScanEye,
    ShieldCheck,
    ChevronRight,
    Home
} from "lucide-react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import Image from "next/image";
import { useRef, useCallback } from "react";

export function MyCardDashboard() {
 // - 3D tilt state for the hero card -
    const cardRef = useRef<HTMLDivElement>(null);
    const rawX = useMotionValue(0);
    const rawY = useMotionValue(0);
    const glareX = useMotionValue(50);
    const glareY = useMotionValue(50);

    const springConfig = { stiffness: 200, damping: 20, mass: 0.5 };
    const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [12, -12]), springConfig);
    const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-12, 12]), springConfig);
    const glareBackground = useTransform(
        [glareX, glareY],
        ([x, y]: number[]) =>
            `radial-gradient(circle at ${x}% ${y}%, var(--color-glass-highlight) 0%, transparent 60%)`
    );
    const glareOpacity = useMotionValue(0);
    const glareOpacitySpring = useSpring(glareOpacity, { stiffness: 120, damping: 20 });

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const el = cardRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        rawX.set(nx);
        rawY.set(ny);
        glareX.set(((e.clientX - rect.left) / rect.width) * 100);
        glareY.set(((e.clientY - rect.top) / rect.height) * 100);
        glareOpacity.set(1);
    }, [rawX, rawY, glareX, glareY, glareOpacity]);

    const handleMouseLeave = useCallback(() => {
        rawX.set(0);
        rawY.set(0);
        glareOpacity.set(0);
    }, [rawX, rawY, glareOpacity]);

    const kycSteps = [
        {
            title: "Basic Info",
            desc: "Personal details (2 mins)",
            icon: UserCheck,
            color: "from-[var(--color-primary)]/10 to-[var(--color-info)]/10",
        },
        {
            title: "Identification",
            desc: "ID or Passport upload (1 min)",
            icon: FileText,
            color: "from-[var(--color-accent)]/10 to-[var(--color-primary)]/10",
        },
        {
            title: "Liveness Check",
            desc: "Quick 3D face scan (1 min)",
            icon: ScanEye,
            color: "from-[var(--color-warning)]/10 to-[var(--color-accent)]/10",
        },
    ];

    return (
        <div className="flex flex-col h-full overflow-visible">
            <PageHeader
                leftSection={
                    <PageTitle
                        title="Activate Your Account"
                        subtitle="Complete KYC to unlock your virtual Visa cards"
                    />
                }
            />

            {/* Main Content Area - Precision Centered Unit Container (Above Fold) - NO Clipping for Blurs */}
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-6 lg:px-20 overflow-visible relative">
                {/* The "Unit": Centered horizontally and vertically - Unified Breakpoint at lg (1024px) */}
                <div className="w-full max-w-[1140px] flex flex-col gap-12 lg:gap-10 xl:gap-12 pb-2 overflow-visible">

                    {/* Main Hero Grid - Strictly 2 columns on tablet/desktop, vertically aligned to center */}
                    <div className="grid grid-cols-1 md:grid-cols-2 items-center md:pt-4 lg:pt-4 xl:pt-8 gap-6 md:gap-8 lg:gap-12 w-full overflow-visible">
                        {/* Left: Content */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6 }}
                            className="flex flex-col items-start gap-4 lg:gap-5"
                        >
                            {/* Fluid Typography: Tightly controlled max-width typography to completely prevent layout collision */}
                            <h1 className="text-[clamp(2rem,7vw,3rem)] md:text-[clamp(2.25rem,5vw,3.5rem)] xl:text-[clamp(2.5rem,4vw,4rem)] font-bold text-[var(--color-text-primary)] leading-[1.05] tracking-tight">
                                On-Chain <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary)] to-purple-400 whitespace-nowrap">
                                    Agentic Banking
                                </span>
                            </h1>

                            <p className="text-base md:text-lg lg:text-xl text-[var(--color-text-muted)] max-w-full lg:max-w-md leading-relaxed font-light mt-2 xl:mt-4">
                                Activate your account now to generate your virtual <br className="block md:hidden" />Visa card and start spending<span className="inline md:hidden"> your stablecoins.</span>
                            </p>

                            <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full sm:w-auto mt-1">
                                <Button
                                    size="lg"
                                    className="h-12 px-6 text-sm font-bold bg-[var(--color-success)] text-black hover:bg-[var(--color-success)]/90 hover:-translate-y-[3px] shadow-xl shadow-[var(--color-success)]/20 rounded-[14px] transition-all duration-300 flex items-center justify-center gap-2 w-full sm:w-auto"
                                >
                                    <span>Activate My Card</span>
                                    <ChevronRight className="w-4 h-4 shrink-0" />
                                </Button>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] font-medium mt-0 uppercase tracking-wider">
                                <ShieldCheck className="w-3 h-3 text-[var(--color-success)]" />
                                <span>Visa Data Encryption</span>
                            </div>
                        </motion.div>

                        {/* Right: Hero Card Visual */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="flex justify-center md:justify-end items-center overflow-visible"
                        >
                            {/* 3D Perspective wrapper */}
                            <div
                                ref={cardRef}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                                style={{ perspective: "800px" }}
                                className="relative group w-full max-w-[340px] sm:max-w-[400px] md:max-w-[440px] lg:w-[370px] lg:max-w-[370px] xl:w-[370px] xl:max-w-[370px] mt-4 md:mt-0 shrink-0"
                            >
                                {/* Blur glow - right flush to avoid hard edge clip */}
                                <div className="absolute -top-2 -bottom-2 -left-2 right-0 sm:-top-4 sm:-bottom-4 sm:-left-4 sm:right-0 bg-[var(--color-primary)]/20 blur-[16px] sm:blur-[40px] rounded-full transition-all duration-700 group-hover:bg-[var(--color-primary)]/30" />
                                <div className="absolute inset-0 bg-[var(--color-primary)]/10 blur-[24px] sm:blur-[60px] rounded-full" />

                                {/* 3D tilt layer - wraps comet border + card together */}
                                <motion.div
                                    style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                                    className="relative"
                                >
                                    {/* Comet border ring: 2px padding exposes the rotating gradient as a border */}
                                    <div
                                        className="relative overflow-hidden shadow-2xl"
                                        style={{ borderRadius: "25.4px", padding: "1.4px" }}
                                    >
                                        {/* Rotating comet orbit - 200% square centered, conic gradient sweeps a bright tip */}
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                                            style={{
                                                position: "absolute",
                                                width: "200%",
                                                height: "200%",
                                                top: "-50%",
                                                left: "-50%",
                                                borderRadius: "50%",
                                                background: "conic-gradient(from 0deg, transparent 0%, transparent 58%, var(--color-glass-highlight) 74%, var(--color-glass-strong) 88%, var(--color-text-primary) 92%, var(--color-glass-strong) 96%, var(--color-glass-highlight) 100%)",
                                            }}
                                        />

                                        {/* Card image - fills the inner area, covering the conic gradient center */}
                                        <div className="relative overflow-hidden" style={{ borderRadius: "24px" }}>
                                            <img
                                                src="/cards/nuro-card-black.png"
                                                alt="Agentic Card"
                                                className="w-full h-auto block"
                                                draggable={false}
                                            />
                                            {/* Glare overlay - hidden at start, subtle on hover */}
                                            <motion.div
                                                className="absolute inset-0 pointer-events-none"
                                                initial={{ opacity: 0 }}
                                                style={{ background: glareBackground, opacity: glareOpacitySpring }}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Steps Row - Strict Binary Layout: Synced with Hero at 1280px (xl) */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 w-full overflow-visible">
                        {kycSteps.map((step, i) => (
                            <div key={step.title} className="relative group/step w-full h-full overflow-visible">
                                <Card
                                    variant="glass"
                                    size="md"
                                    className="relative transition-all duration-300 group-hover/step:-translate-y-[2px] h-full flex flex-col justify-center"
                                >
                                    <div className="relative flex items-center gap-4">
                                        {/* Icon Wrapper */}
                                        <div className="h-10 w-10 shrink-0 rounded-[12px] bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                                            <step.icon className="w-5 h-5" />
                                        </div>

                                        {/* Text Content: 1-line in stacked wide view, original stacked details in xl 3-col view */}
                                        <div className="min-w-0 flex-1 flex flex-col sm:flex-row xl:flex-col sm:items-baseline xl:items-start sm:gap-3 xl:gap-0 mt-0.5 xl:mt-0 xl:justify-center">
                                            <h4 className="font-semibold text-base sm:text-lg xl:text-sm text-[var(--color-text-primary)] leading-tight whitespace-nowrap">
                                                {step.title}
                                            </h4>
                                            <p className="text-sm sm:text-[15px] xl:text-[12px] text-[var(--color-text-muted)] leading-[1.3] truncate sm:overflow-visible xl:overflow-hidden sm:whitespace-normal xl:whitespace-nowrap mt-0.5 xl:mt-0">
                                                {step.desc}
                                            </p>
                                        </div>
                                    </div>
                                </Card>

                                {/* Number Bubble - Sharp Content Layer with Clipped Internal Blur */}
                                <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-8 h-8 z-30 transition-all duration-300 group-hover/step:scale-110 pointer-events-none overflow-hidden rounded-full border border-[var(--color-border-glass)] shadow-lg">
                                    <div className="absolute inset-[-10px] bg-[var(--color-bg-secondary)] filter blur-md opacity-75" />
                                    <div className="absolute inset-0 bg-[var(--color-bg-glass-strong)] backdrop-blur-[var(--glass-blur)]" />
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <span className="text-[14px] font-black text-[var(--color-text-primary)] leading-none">
                                            {i + 1}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MyCardDashboard;
