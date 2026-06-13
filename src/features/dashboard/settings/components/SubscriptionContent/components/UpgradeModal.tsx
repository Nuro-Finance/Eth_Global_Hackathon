"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import {
  FULL_MODAL_OVERLAY_CLASS,
  FULL_MODAL_SURFACE_CLASS,
} from "@/components/ui/modalPresets";
import { Check, X, Shield, Zap, Gem } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PlanConfig {
  id: string;
  name: string;
  price: string;
  description: string;
  icon: React.ElementType;
  features: PlanFeature[];
  active?: boolean;
  popular?: boolean;
  buttonLabel: string;
}

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const layerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const cascadeVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.33, 1, 0.68, 1],
    },
  },
};

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const PLANS: PlanConfig[] = [
    {
      id: "starter",
      name: "Starter",
      price: "0.00",
      description: "Give your AI agent a Visa card. No monthly fee, no commitment.",
      icon: Shield,
      buttonLabel: "Active",
      active: true,
      features: [
        { text: "1 Virtual card", included: true },
        { text: "5% Reload fee", included: true },
        { text: "10 Transactions/mo", included: true },
        { text: "Basic spending controls", included: true },
      ],
    },
    {
      id: "standard",
      name: "Nuro+",
      price: "19.00",
      description: "Scale your agents with more cards, lower fees, and a physical card.",
      icon: Zap,
      buttonLabel: "Upgrade to Nuro+",
      popular: true,
      features: [
        { text: "3 Virtual cards", included: true },
        { text: "4.5% Reload fee", included: true },
        { text: "Physical Nuro Card", included: true },
        { text: "Agentic spending control", included: true },
      ],
    },
    {
      id: "pro",
      name: "Nuro Teams",
      price: "49.00",
      description: "Full infrastructure for teams and operators running agents at scale.",
      icon: Gem,
      buttonLabel: "Upgrade to Nuro Teams",
      features: [
        { text: "10 Virtual cards", included: true },
        { text: "3.5% Reload fee", included: true },
        { text: "Unlimited transactions", included: true },
        { text: "Nuro Intelligence AI", included: true },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className="notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 !overflow-visible p-[12px] max-w-[1024px] !rounded-[56px] backdrop-blur-md shadow-xl"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px', borderStyle: 'solid' }}
      >
        <div
          className="relative w-full h-full !backdrop-blur-none rounded-[44px] overflow-hidden flex flex-col"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          <motion.div
            className="relative p-6 sm:px-10 sm:pt-10 sm:pb-6 shrink-0"
            variants={layerVariants}
            initial="initial"
            animate="animate"
          >
            {/* Close Button Override for Design Parity */}
            <DialogClose className="absolute right-8 top-8 p-1.5 rounded-[10px] hover:bg-white/5 transition-colors">
              <X className="w-4 h-4 text-white/50" />
            </DialogClose>

            <motion.div className="flex flex-col items-center text-center mb-8" variants={cascadeVariants}>
              <DialogTitle className="text-3xl sm:text-4xl font-black tracking-tighter text-white mb-3">
                BANK WITHOUT LIMITS
              </DialogTitle>
              <DialogDescription className="text-[17px] text-white/50 max-w-2xl font-semibold leading-relaxed">
                The first neobank built for agents and the humans who run them.
              </DialogDescription>

              {/* Billing Cycle Toggle */}
              <div className="relative mt-8 group/switch inline-flex">
                {/* -20% Badge popped out to top right */}
                <div className="absolute -top-3.5 -right-2 px-2 py-0.5 rounded-full bg-[var(--color-success)]/50 border border-[var(--color-success)] text-white text-[9px] font-black uppercase tracking-wider shadow-[0_0_12px_rgba(0,200,150,0.3)] z-20">
                  -20%
                </div>

                <div className="relative p-1 bg-white/[0.04] border border-white/[0.05] rounded-full flex items-center w-full min-w-[200px]">
                  <button
                    onClick={() => setBillingCycle("monthly")}
                    className={cn(
                      "relative flex-1 px-6 py-1.5 rounded-full text-[12px] font-bold transition-colors duration-300",
                      billingCycle === "monthly" ? "text-white" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    {billingCycle === "monthly" && (
                      <motion.div
                        layoutId="billing-pill"
                        className="absolute inset-0 bg-white/10 rounded-full shadow-lg z-0"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">Monthly</span>
                  </button>
                  <button
                    onClick={() => setBillingCycle("annual")}
                    className={cn(
                      "relative flex-1 px-6 py-1.5 rounded-full text-[12px] font-bold transition-colors duration-300",
                      billingCycle === "annual" ? "text-white" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    {billingCycle === "annual" && (
                      <motion.div
                        layoutId="billing-pill"
                        className="absolute inset-0 bg-white/10 rounded-full shadow-lg z-0"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">Annual</span>
                  </button>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PLANS.map((plan) => {
                const Icon = plan.icon;
                return (
                  <motion.div
                    key={plan.id}
                    className="relative group"
                    variants={cascadeVariants}
                  >
                    {/* Subtle Background Glow behind card - Tightened to prevent bleed */}
                    {plan.popular && (
                      <div className="absolute inset-[-10%] bg-[var(--color-primary)]/10 blur-[40px] rounded-full pointer-events-none z-[-1]" />
                    )}

                    {/* Popular Badge */}
                    {plan.popular && (
                      <div className="absolute -top-3 right-8 px-3 py-1 bg-[var(--color-primary)] text-white text-[11px] font-bold uppercase tracking-widest rounded-full shadow-lg z-50">
                        Popular
                      </div>
                    )}

                    <div
                      className={cn(
                        "relative flex flex-col p-6 rounded-[24px] transition-all duration-300 overflow-hidden h-full z-10",
                        "bg-black/30 backdrop-blur-none", // Back to 0.3 fill
                        plan.popular
                          ? "border-none shadow-[0_0_40px_rgba(132,111,255,0.15)]"
                          : "border border-white/[0.04] hover:border-white/20"
                      )}
                    >
                      {/* Burst Background for Popular Tier - Stops 3/4 way up */}
                      {plan.popular && (
                        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                          <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-[var(--color-primary)]/60 via-[var(--color-primary)]/20 to-transparent translate-y-full group-hover:translate-y-[25%] transition-transform duration-700 ease-[cubic-bezier(0.33,1,0.68,1)]" />
                        </div>
                      )}

                      {/* Official Unified Border: Baseline Stroke + Comet Animation on same mask path */}
                      {plan.popular && (
                        <div
                          className="absolute inset-[-1px] rounded-[24px] pointer-events-none"
                          style={{
                            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                            maskComposite: "exclude",
                            WebkitMaskComposite: "xor",
                            padding: "3px", // Bold 3px thickness
                          }}
                        >
                          {/* Static Baseline Path (Purple) */}
                          <div className="absolute inset-0 bg-[var(--color-primary)]/40" />

                          {/* Dynamic Comet Path (Rotating) */}
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-[-100%] rounded-full opacity-70"
                            style={{
                              background: "conic-gradient(from 0deg, transparent 0%, transparent 75%, var(--color-primary) 88%, var(--color-text-primary) 92%, var(--color-primary) 96%, transparent 100%)",
                            }}
                          />
                        </div>
                      )}


                      <div className="flex items-center gap-3 mb-4 text-left w-full relative z-10">
                        <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.05]">
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <h4 className="text-lg font-bold text-white tracking-tight">{plan.name}</h4>
                      </div>

                      <div className="flex items-baseline gap-1 mb-4 text-left w-full">
                        <span className="text-2xl font-bold text-white">$</span>
                        <span className="text-5xl font-black text-white tracking-tighter">
                          {billingCycle === "annual"
                            ? (parseFloat(plan.price) * 0.8).toFixed(0)
                            : plan.price.split(".")[0]}
                        </span>
                        <span className="text-2xl font-bold text-white/30">
                          .{plan.price.split(".")[1] || "00"}
                        </span>
                      </div>

                      <p className="text-[14px] leading-snug text-white/50 font-medium mb-6 line-clamp-2 h-10 overflow-hidden text-left w-full">
                        {plan.description}
                      </p>

                      <button
                        disabled={plan.active}
                        className={cn(
                          "w-full py-3.5 rounded-xl text-[14px] font-bold transition-all duration-300 mb-6 flex items-center justify-center gap-2",
                          plan.active
                            ? "bg-white/5 text-white/40 cursor-default"
                            : plan.popular 
                              ? "bg-[var(--color-primary)] text-white group-hover:bg-white group-hover:text-black hover:scale-[1.02] active:scale-[0.98]"
                              : "bg-white text-black hover:scale-[1.02] active:scale-[0.98]"
                        )}
                      >
                        {plan.buttonLabel}
                        {plan.active && <Check className="w-4 h-4" />}
                      </button>

                      <div className="space-y-3 pt-4 border-t border-white/[0.04]">
                        {plan.features.map((feature, i) => {
                          const isGreenCheck = i === 0;

                          return (
                            <div key={i} className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
                                  feature.included
                                    ? isGreenCheck
                                      ? "bg-[var(--color-success)]/10"
                                      : plan.popular
                                        ? "bg-[var(--color-primary)]/10 group-hover:bg-white/20"
                                        : "bg-[var(--color-primary)]/10"
                                    : "bg-white/5"
                                )}
                              >
                                <Check
                                  className={cn(
                                    "w-3 h-3 transition-colors duration-200",
                                    feature.included
                                      ? isGreenCheck
                                        ? "text-[var(--color-success)]"
                                        : plan.popular
                                          ? "text-[var(--color-primary)] group-hover:text-white"
                                          : "text-[var(--color-primary)]"
                                      : "text-white/20"
                                  )}
                                />
                              </div>
                              <span
                                className={cn(
                                  "text-[13px] font-medium transition-colors duration-200 whitespace-nowrap overflow-hidden text-ellipsis",
                                  feature.included
                                    ? plan.popular
                                      ? "text-white/80 group-hover:text-white"
                                      : "text-white/80"
                                    : "text-white/20"
                                )}
                              >
                                {feature.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <motion.div className="mt-8 text-center text-[13px] font-medium text-white/30" variants={cascadeVariants}>
              Need more capabilities for your business?{" "}
              <button className="text-[var(--color-primary)] hover:underline">
                Learn more about our Enterprise plans.
              </button>
            </motion.div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
