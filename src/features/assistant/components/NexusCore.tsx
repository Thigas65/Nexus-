import { useEffect, useRef } from "react";
import type { AssistantActivityState } from "../domain/AssistantActivityState";

interface NexusCoreProps {
  state: AssistantActivityState;
  speechIntensity: number;
}

const stateLabels: Record<AssistantActivityState, string> = {
  idle: "EM REPOUSO",
  "waiting-for-wake-word": "AGUARDANDO PALAVRA",
  listening: "OUVINDO",
  processing: "PROCESSANDO",
  speaking: "FALANDO",
  paused: "PAUSADO",
  connecting: "CONECTANDO",
  error: "INDISPONÍVEL",
};

export function NexusCore({ state, speechIntensity }: NexusCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activityRef = useRef({ state, speechIntensity });
  const drawFrameRef = useRef<((time: number) => void) | null>(null);
  activityRef.current = { state, speechIntensity };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawFrameRef.current?.(performance.now());
    };

    const drawFrame = (time: number) => {
      if (!width || !height) return;
      const { state: activity, speechIntensity: voice } = activityRef.current;
      const elapsed = motionPreference.matches ? 0 : time / 1000;
      const pulse =
        activity === "speaking"
          ? Math.max(0.22, voice)
          : activity === "listening"
            ? 0.28 + Math.sin(elapsed * 2.4) * 0.16
            : activity === "processing" || activity === "connecting"
              ? 0.42 + Math.sin(elapsed * 3.2) * 0.2
              : activity === "idle" || activity === "waiting-for-wake-word"
                ? 0.08 + Math.sin(elapsed * 1.1) * 0.045
                : 0.04;

      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.44 * (1 + pulse * 0.075);
      const glow = context.createRadialGradient(
        centerX,
        centerY,
        radius * 0.48,
        centerX,
        centerY,
        radius * 1.55,
      );
      glow.addColorStop(0, `rgba(26, 158, 245, ${0.025 + pulse * 0.045})`);
      glow.addColorStop(0.7, `rgba(28, 179, 255, ${0.035 + pulse * 0.07})`);
      glow.addColorStop(1, "rgba(24, 154, 255, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalCompositeOperation = "lighter";
      const rotation = elapsed * (0.09 + pulse * 0.12);
      const tilt = 0.36 + Math.sin(elapsed * 0.23) * 0.08;
      const filamentCount = 12;
      const segments = 128;

      for (let filament = 0; filament < filamentCount; filament += 1) {
        const phase = filament * 2.399;
        const direction = filament % 2 === 0 ? 1 : -1;
        const orientation = phase * 0.41 + rotation * direction;
        const horizontalScale = 0.9 + (filament % 4) * 0.035;
        const verticalScale = 0.76 + (filament % 5) * 0.045;
        context.beginPath();
        for (let index = 0; index <= segments; index += 1) {
          const angle = (index / segments) * Math.PI * 2;
          const wobble =
            1 +
            Math.sin(angle * (2 + filament % 3) + phase + elapsed * 0.74) *
              (0.018 + pulse * 0.032) +
            Math.sin(angle * 5 - phase * 0.7 - elapsed * 0.42) * 0.012;
          const x = Math.cos(angle) * radius * horizontalScale * wobble;
          const y = Math.sin(angle) * radius * verticalScale * wobble;
          const depth = Math.sin(angle * 2 + phase + rotation) * radius * 0.13;
          const tiltedY = y * Math.cos(tilt) - depth * Math.sin(tilt);
          const rotatedX = x * Math.cos(orientation) - tiltedY * Math.sin(orientation);
          const rotatedY = x * Math.sin(orientation) + tiltedY * Math.cos(orientation);
          const perspective = 0.94 + (depth / radius) * 0.16;
          const pointX = centerX + rotatedX * perspective;
          const pointY = centerY + rotatedY * perspective;
          if (index === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        }

        const hue =
          activity === "error"
            ? 8 + Math.sin(phase + elapsed * 0.35) * 8
            : 188 + Math.sin(phase + elapsed * 0.35) * 13;
        context.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.2 + pulse * 0.23})`;
        context.lineWidth = 0.7 + pulse * 0.72;
        context.shadowBlur = 7 + pulse * 15;
        context.shadowColor =
          activity === "error" ? "rgba(255, 130, 115, 0.7)" : "rgba(51, 194, 255, 0.78)";
        context.stroke();
      }

      context.shadowBlur = 12 + pulse * 18;
      context.fillStyle =
        activity === "error"
          ? `rgba(255, 177, 160, ${0.48 + pulse * 0.24})`
          : `rgba(120, 229, 255, ${0.62 + pulse * 0.3})`;
      for (let index = 0; index < 7; index += 1) {
        const angle = index * 2.399 + elapsed * (0.28 + pulse * 0.24);
        const distance =
          radius * (0.78 + Math.sin(index * 1.9 + elapsed * 0.68) * 0.12);
        context.beginPath();
        context.arc(
          centerX + Math.cos(angle) * distance,
          centerY + Math.sin(angle * 1.08) * distance * 0.88,
          1 + pulse * 1.6,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      context.restore();
    };

    drawFrameRef.current = drawFrame;
    const animate = (time: number) => {
      drawFrame(time);
      if (!motionPreference.matches) animationFrame = window.requestAnimationFrame(animate);
    };
    const updateMotionPreference = () => {
      window.cancelAnimationFrame(animationFrame);
      if (motionPreference.matches) drawFrame(performance.now());
      else animationFrame = window.requestAnimationFrame(animate);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    if (observer) observer.observe(canvas);
    else window.addEventListener("resize", resize);
    if (typeof motionPreference.addEventListener === "function") {
      motionPreference.addEventListener("change", updateMotionPreference);
    } else {
      motionPreference.addListener(updateMotionPreference);
    }
    resize();
    updateMotionPreference();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", resize);
      if (typeof motionPreference.removeEventListener === "function") {
        motionPreference.removeEventListener("change", updateMotionPreference);
      } else {
        motionPreference.removeListener(updateMotionPreference);
      }
      drawFrameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawFrameRef.current?.(performance.now());
    }
  }, [state, speechIntensity]);

  return (
    <div
      className={`core-wrap core-wrap--${state}`}
      role="img"
      aria-label={`Nexus Core: ${stateLabels[state].toLowerCase()}`}
      data-state={state}
    >
      <div className="core">
        <canvas className="core__filaments" ref={canvasRef} aria-hidden="true" />
      </div>
    </div>
  );
}
