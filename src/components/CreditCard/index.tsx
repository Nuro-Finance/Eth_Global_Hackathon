"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Lock } from "lucide-react";
import {
  motion,
  AnimatePresence,
  Variants,
  useMotionValue,
  useTransform,
  useSpring,
} from "framer-motion";
import { CardContent } from "./components";
import { cn } from "@/lib/utils";
import {
  AGENCY_WHITE_SKIN_OVERLAY_OPACITY,
  resolveNuroCardFaceSrcFromGradient,
  isWhiteCardSkinGradient,
} from "@/lib/cardSkins";
import { GradientCrossfadeLayers } from "@/components/GradientCrossfadeLayers";

/** Matches Card Details “Card Frozen” accent */
const FROZEN_CORAL = "var(--color-error)";

const freezeDimVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 0.35,
    transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.42, ease: [0.32, 0.72, 0, 1] as const },
  },
};

const freezeBadgeWrapVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const, delay: 0.05 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.28, ease: [0.4, 0, 1, 1] as const },
  },
};

const freezeBadgeTransition = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.85,
  delay: 0.1,
};

const freezeBadgeExitTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 36,
  mass: 0.75,
};

interface CardPosition {
  x: number;
  y: number;
  z: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
  zIndex: number;
  opacity: number;
}

export interface CreditCardProps {
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  gradient: string;
  id?: string;
  isAgency?: boolean;
  onClick?: () => void;
 // Animation props (optional - for CardStack usage)
  animated?: boolean;
  isFront?: boolean;
  isAnimating?: boolean;
  cardVariants?: Variants;
  cardPosition?: CardPosition;
  isRtl?: boolean;
  onSwap?: () => void;
  className?: string; // Add className
 /** Renders dim + lock/Frozen chip on the card plane (inherits 3D tilt). */
  isFrozen?: boolean;
 /** Fixed thumbnail size (78×49) for chat-active list chip. */
  compact?: boolean;
 /** Fill parent slot (`w-full h-full`) instead of responsive breakpoints. */
  fill?: boolean;
}

/**
 * CreditCard - Displays a styled credit card with optional stack animations and parallax
 */
export default function CreditCard({
  cardNumber,
  cardHolder,
  expiryDate,
  gradient,
  id = "VISA",
  isAgency = false,
  onClick,
 // Animation props
  animated = false,
  isFront = true,
  isAnimating = false,
  cardVariants,
  cardPosition,
  isRtl = false,
  onSwap,
  className,
  isFrozen = false,
  compact = false,
  fill = false,
}: CreditCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

 // - 3D tilt state for parallax -
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);

  const springConfig = { stiffness: 200, damping: 20, mass: 0.5 };
  const rotateXHover = useSpring(useTransform(rawY, [-0.5, 0.5], [12, -12]), springConfig);
  const rotateYHover = useSpring(useTransform(rawX, [-0.5, 0.5], [-12, 12]), springConfig);

  const glareBackground = useTransform(
    [glareX, glareY],
    ([x, y]: number[]) =>
      `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.08) 0%, transparent 60%)`
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

 // Ensure highlight stays active while moving or entered
    if (glareOpacity.get() !== 1) glareOpacity.set(1);
    if (!isHovered) setIsHovered(true);
  }, [rawX, rawY, glareX, glareY, glareOpacity, isHovered]);

  const handleMouseLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
    glareOpacity.set(0);
    setIsHovered(false);
  }, [rawX, rawY, glareOpacity]);

  useEffect(() => {
    if (!isFrozen) return;
    rawX.set(0);
    rawY.set(0);
    glareOpacity.set(0);
    setIsHovered(false);
  }, [isFrozen, rawX, rawY, glareOpacity]);

  const whiteSkin = isWhiteCardSkinGradient(gradient);
  const cardFaceSrc = resolveNuroCardFaceSrcFromGradient(gradient);

  const cardElement = (
    <div
      className={cn(
        "rounded-2xl md:rounded-[20px] lg:rounded-[22px] overflow-hidden flex flex-col justify-between w-full h-full relative z-10 transition-shadow duration-300 dark:border dark:border-[rgba(255,255,255,0.2)] shadow-[0_20px_35px_-10px_var(--color-card-shadow-default),0_8px_15px_-5px_var(--color-shadow-primary)] dark:shadow-none",
        isHovered && !animated ? "shadow-[0_25px_50px_-12px_var(--color-card-shadow-hover),0_10px_20px_-5px_var(--color-shadow-primary)] dark:shadow-none" : "",
      )}
      style={{
        background: isAgency ? "rgba(0,0,0,0)" : undefined,
        transformStyle: "preserve-3d",
        padding: "0",
        transition: "box-shadow 0.3s ease",
      }}
      onClick={animated ? undefined : onClick}
    >
      <img
        src={cardFaceSrc}
        alt="Nuro Card"
        className="absolute inset-0 z-0 w-full h-full object-cover block"
        draggable={false}
        loading="eager"
      />
      {/* Agency cards previously used a separate base image; keep the tint overlay behavior if needed. */}
      {isAgency && gradient && (
        <div
          className={cn(
            "absolute inset-0 z-5 overflow-hidden rounded-[inherit]",
            whiteSkin ? "" : "opacity-40 mix-blend-color"
          )}
          style={whiteSkin ? { opacity: AGENCY_WHITE_SKIN_OVERLAY_OPACITY } : undefined}
        >
          <GradientCrossfadeLayers gradient={gradient} className="rounded-[inherit]" />
        </div>
      )}
      {/* Glare overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-10"
        initial={false}
        style={{ background: glareBackground, opacity: glareOpacitySpring }}
      />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <CardContent
          cardNumber={cardNumber}
          cardHolder={cardHolder}
          expiryDate={expiryDate}
          id={id}
        />
      </div>
    </div>
  );

 // Merge the base rotation from CardStack with our hover rotation
 // If not animated (CardStack bypass), just use hover rotation.
  const animatedRotateX = cardPosition ? cardPosition.rotateX : 0;
  const animatedRotateY = cardPosition ? cardPosition.rotateY : 0;
  const animatedRotateZ = cardPosition ? cardPosition.rotateZ : 0;

 // We wrap the card in our parallax motion.div
  const contentNode = (
    <motion.div
      ref={cardRef}
      onMouseEnter={isFrozen ? undefined : handleMouseMove}
      onMouseMove={isFrozen ? undefined : handleMouseMove}
      onMouseLeave={isFrozen ? undefined : handleMouseLeave}
      className={cn(
        fill
          ? "w-full h-full select-none"
          : compact
            ? "w-[78px] h-[49px] select-none"
            : "w-[260px] h-[164px] sm:w-[300px] sm:h-[189px] md:w-[240px] md:h-[151px] lg:w-[240px] lg:h-[151px] xl:w-[280px] xl:h-[176px] 2xl:w-[320px] 2xl:h-[202px] select-none",
        className
      )}
      style={{
        rotateX: rotateXHover,
        rotateY: rotateYHover,
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className="relative w-full h-full rounded-2xl md:rounded-[20px] lg:rounded-[22px]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {cardElement}
        <AnimatePresence>
          {isFrozen && (
            <>
              <motion.div
                key="freeze-dim"
                className="absolute inset-0 z-[28] rounded-[inherit] cursor-default bg-black pointer-events-auto"
                variants={freezeDimVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                aria-hidden
              />
              <motion.div
                key="freeze-badge-wrap"
                className="absolute inset-0 z-[29] flex items-center justify-center rounded-[inherit] pointer-events-none"
                variants={freezeBadgeWrapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                aria-hidden
              >
                <motion.div
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-[12px]",
                    "border border-white/[0.12]",
                    "bg-[rgba(42,40,38,0.55)] shadow-[0_6px_22px_rgba(0,0,0,0.26)]",
                  )}
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.93,
                    y: 6,
                    transition: freezeBadgeExitTransition,
                  }}
                  transition={freezeBadgeTransition}
                >
                  <Lock
                    className="w-4 h-4 shrink-0"
                    style={{ color: FROZEN_CORAL }}
                    strokeWidth={2.25}
                  />
                  <span
                    className="text-sm font-semibold tracking-tight"
                    style={{ color: FROZEN_CORAL }}
                  >
                    Frozen
                  </span>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

 // Return with animation wrapper for CardStack usage
  if (animated && cardVariants && cardPosition) {
 // During animation, front card going up should stay on top
 // After animation completes, z-index follows cardPosition
    const animationZIndex = isAnimating && isFront ? 100 : cardPosition.zIndex;

    return (
      <motion.div
        className={cn("relative", isFrozen ? "cursor-default" : "cursor-pointer")}
        variants={cardVariants}
        initial={false}
        animate={
          isAnimating && isFront
            ? "exitUp"
            : {
              x: cardPosition.x,
              y: cardPosition.y,
              z: cardPosition.z,
              rotateZ: animatedRotateZ,
              scale: cardPosition.scale,
              opacity: cardPosition.opacity,
              transition: {
                duration: isAnimating ? 0.5 : 0,
                ease: [0.32, 0.7, 0, 1],
              },
            }
        }
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "center center",
          zIndex: animationZIndex,
          willChange: "transform",
          transform: "translate3d(0, 0, 0)",
          backfaceVisibility: "hidden",
        }}
        onClick={isFront && !isAnimating && !isFrozen ? onSwap : undefined}
      >
        {contentNode}
      </motion.div>
    );
  }

  return contentNode;
}

export { CreditCard };
