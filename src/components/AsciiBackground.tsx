"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Renderer, Geometry, Program, Mesh, Vec2, Texture } from "ogl";

const vertex = `
    attribute vec2 uv;
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 0, 1);
    }
`;

const fragment = `
    precision highp float;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec2 uResolution;
    uniform sampler2D uCharAtlas;
    uniform float uNumChars;
    uniform float uEmbedded;
    uniform float uIntensity;
    varying vec2 vUv;

    float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec2 grid = vec2(112.0, 56.0);
        vec2 uv = vUv;
        
        float edgeNoise = noise(uv * 8.0 + uTime * 0.04) * 0.1;
        float mask = smoothstep(0.85 + edgeNoise, 0.0, uv.y);
        if (mask < 0.01) discard;

        vec2 cellUv = uv * grid;
        vec2 blockUv = floor(cellUv) / grid;
        vec2 charInCellUv = (fract(cellUv) - 0.5) * 0.9 + 0.5;
        
        if (charInCellUv.x < 0.0 || charInCellUv.x > 1.0 || charInCellUv.y < 0.0 || charInCellUv.y > 1.0) discard;

        float swirl = sin(length(blockUv - vec2(0.5, 0.1)) * 10.0 - uTime * 2.2 + atan(blockUv.y - 0.1, blockUv.x - 0.5) * 2.0) * 0.5 + 0.5;
        float burst = smoothstep(0.32, 0.0, distance(uMouse, vUv));

        float shuffleSpeed = 12.0;
        float n = noise(blockUv + floor(uTime * shuffleSpeed + noise(blockUv) * 10.0)); 
        float charIdx = floor(n * uNumChars);
        
        float charWidth = 1.0 / uNumChars;
        vec2 atlasUv = vec2((charIdx * charWidth) + (charInCellUv.x * charWidth), charInCellUv.y);
        
        vec4 charColor = texture2D(uCharAtlas, atlasUv);
        if (charColor.r < 0.5) discard; 

        vec3 color = mix(vec3(0.42), vec3(0.85), max(burst, pow(swirl, 4.0) * 0.4));
        float brightness = mask * (0.264 + burst * 0.33 + swirl * 0.198);
        if (uEmbedded > 0.5) {
            brightness *= 2.05;
        }
        brightness *= uIntensity;

        gl_FragColor = vec4(color * brightness, brightness);
    }
`;

export type AsciiBackgroundProps = {
 /**
 * When true: fill the nearest positioned ancestor, same shader as login; canvas sits behind `children`.
 * No extra chrome - only absolute canvas + blend on the canvas.
 */
  embedded?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export const AsciiBackground: React.FC<AsciiBackgroundProps> = ({
  embedded = false,
  className,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef(new Vec2(0.5, 0.5));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isSafari =
      ua.includes("Safari") &&
      !ua.includes("Chrome") &&
      !ua.includes("Chromium") &&
      !ua.includes("Android");
 // Safari renders this effect louder + can show glyph sampling artifacts; match Chrome without touching it.
    const safariIntensity = 0.65;

    const renderer = new Renderer({ alpha: true, antialias: false });
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    if (embedded) {
      canvas.style.zIndex = "1";
      const backing = container.querySelector<HTMLElement>("[data-ascii-backing]");
      if (backing) {
        backing.insertAdjacentElement("afterend", canvas);
      } else {
        container.prepend(canvas);
      }
    } else {
      container.appendChild(canvas);
    }

    const charSet = "01";
    const atlasCanvas = document.createElement("canvas");
    const fontSize = 128;
    atlasCanvas.width = fontSize * charSet.length;
    atlasCanvas.height = fontSize;
    const ctx = atlasCanvas.getContext("2d", { alpha: false })!;

    const draw = () => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
      ctx.fillStyle = "white";
      ctx.font = `300 ${fontSize * 0.8}px "Source Code Pro", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < charSet.length; i++) {
        const char = charSet[i];
        const x = i * fontSize + fontSize / 2;
        const y = fontSize / 2;
        ctx.fillText(char, x, y);

        if (char === "0") {
          ctx.beginPath();
          ctx.arc(x, y, fontSize * 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    draw();
    if ("fonts" in document) {
      void document.fonts.ready.then(() => {
        draw();
        atlasTexture.needsUpdate = true;
      });
    }

    const atlasTexture = new Texture(gl, {
      image: atlasCanvas,
 // IMPORTANT: keep Chrome behavior untouched; Safari gets crisp nearest sampling + no mipmaps.
      generateMipmaps: isSafari ? false : true,
      minFilter: isSafari ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR,
      magFilter: isSafari ? gl.NEAREST : gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });
    const geometry = new Geometry(gl, {
      position: { size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) },
      uv: { size: 2, data: new Float32Array([0, 0, 2, 0, 0, 2]) },
    });

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: mouseRef.current },
        uResolution: { value: new Vec2(window.innerWidth, window.innerHeight) },
        uCharAtlas: { value: atlasTexture },
        uNumChars: { value: charSet.length },
        uEmbedded: { value: embedded ? 1 : 0 },
        uIntensity: { value: isSafari ? safariIntensity : 1 },
      },
      transparent: true,
    });

    const mesh = new Mesh(gl, { geometry, program });
    const resUniform = program.uniforms.uResolution.value as Vec2;

    const applySizeFullscreen = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      resUniform.set(w, h);
    };

    const applySizeEmbedded = () => {
      const w = Math.max(1, Math.floor(container.clientWidth));
      const h = Math.max(1, Math.floor(container.clientHeight));
      renderer.setSize(w, h);
      resUniform.set(w, h);
    };

    const handleResize = embedded ? applySizeEmbedded : applySizeFullscreen;

    const handleMouseMove = (e: MouseEvent) => {
      if (!embedded) {
        mouseRef.current.set(
          e.clientX / window.innerWidth,
          1.0 - e.clientY / window.innerHeight
        );
        return;
      }
      const r = container.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = 1.0 - (e.clientY - r.top) / r.height;
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
        mouseRef.current.set(nx, ny);
      } else {
        mouseRef.current.set(2, 2);
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);

    let resizeObserver: ResizeObserver | undefined;
    const kickResize = () => {
      handleResize();
      requestAnimationFrame(() => handleResize());
    };
    if (embedded) {
      resizeObserver = new ResizeObserver(() => kickResize());
      resizeObserver.observe(container);
      kickResize();
    } else {
      handleResize();
    }

    let animationId: number;
    const update = (t: number) => {
      animationId = requestAnimationFrame(update);
      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
    };
    animationId = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      resizeObserver?.disconnect();
      cancelAnimationFrame(animationId);
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
  }, [embedded]);

  return (
    <div
      ref={containerRef}
      className={cn(
        embedded ? "relative isolate" : "pointer-events-none fixed inset-0 z-0",
        className
      )}
      style={embedded ? undefined : { mixBlendMode: "screen" }}
    >
      {embedded ? (
        <div
          data-ascii-backing
          className="pointer-events-none absolute inset-0 z-0 bg-[var(--color-bg-primary)]"
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  );
};
