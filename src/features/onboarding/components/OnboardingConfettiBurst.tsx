"use client";

import { useLayoutEffect, useRef } from "react";

const COLORS = ["#0D90FF", "#16e0a9", "#ffffff", "#60a5fa", "#f472b6", "#fbbf24"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
};

function createBurst(width: number, height: number): Particle[] {
  const originX = width * 0.5;
  const originY = height * 0.42;

  return Array.from({ length: 80 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      rotation: Math.random() * 360,
      spin: (Math.random() - 0.5) * 12,
    };
  });
}

/** Fires once on mount - parent must be `position: relative` with real dimensions. */
export function OnboardingConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const start = () => {
      if (cancelled) return;

      const parent = canvas.parentElement;
      if (!parent) return;

      const width = parent.clientWidth || 560;
      const height = parent.clientHeight || 520;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const particles = createBurst(width, height);
      let frame = 0;
      const maxFrames = 120;

      const tick = () => {
        if (cancelled) return;

        frame += 1;
        const life = Math.max(0, 1 - frame / maxFrames);
        ctx.clearRect(0, 0, width, height);

        for (const particle of particles) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.vy += 0.18;
          particle.vx *= 0.985;
          particle.rotation += particle.spin;

          ctx.save();
          ctx.globalAlpha = life;
          ctx.translate(particle.x, particle.y);
          ctx.rotate((particle.rotation * Math.PI) / 180);
          ctx.fillStyle = particle.color;
          ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
          ctx.restore();
        }

        if (frame < maxFrames) {
          frameRef.current = window.requestAnimationFrame(tick);
        }
      };

      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(start);

    return () => {
      cancelled = true;
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[75] h-full w-full"
      aria-hidden
    />
  );
}
