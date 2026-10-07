import { useEffect, useRef } from "react";
import type { AssistantActivityState } from "../domain/AssistantActivityState";
import { NexusMark } from "./NexusMark";

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
          ? Math.max(0, voice)
          : activity === "listening"
            ? 0.16 + Math.sin(elapsed * 2.4) * 0.08
            : activity === "processing" || activity === "connecting"
              ? 0.34 + Math.sin(elapsed * 3.2) * 0.12
              : activity === "idle" || activity === "waiting-for-wake-word"
                ? 0.045 + Math.sin(elapsed * 1.1) * 0.025
                : 0.03;

      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.47 * (1 + pulse * 0.055);
      const glow = context.createRadialGradient(
        centerX,
        centerY,
        radius * 0.12,
        centerX,
        centerY,
        radius,
      );
      glow.addColorStop(0, `rgba(26, 158, 245, ${0.08 + pulse * 0.1})`);
      glow.addColorStop(0.72, `rgba(28, 179, 255, ${0.035 + pulse * 0.055})`);
      glow.addColorStop(1, "rgba(24, 154, 255, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalCompositeOperation = "lighter";
      const yaw = elapsed * (0.13 + pulse * 0.1);
      const tilt = 0.43 + Math.sin(elapsed * 0.24) * 0.07;
      const drawFilament = (latitude: number, longitude: number, meridian: boolean) => {
        context.beginPath();
        const segments = 88;
        for (let index = 0; index <= segments; index += 1) {
          const angle = (index / segments) * Math.PI * 2;
          const curveAngle = meridian ? latitude + angle : angle;
          const curveLatitude = meridian ? longitude : latitude;
          const wobble =
            1 +
            Math.sin(angle * 3 + longitude + elapsed * 0.7) *
              (0.012 + pulse * 0.022);
          let x: number;
          let y: number;
          let z: number;
          if (meridian) {
            x = Math.sin(curveAngle) * Math.cos(curveLatitude) * radius * wobble;
            y = Math.sin(curveLatitude) * radius * wobble;
            z = Math.cos(curveAngle) * Math.cos(curveLatitude) * radius * wobble;
          } else {
            x = Math.cos(curveLatitude) * Math.cos(angle + longitude) * radius * wobble;
            y = Math.sin(curveLatitude) * radius * wobble;
            z = Math.cos(curveLatitude) * Math.sin(angle + longitude) * radius * wobble;
          }

          const rotatedX = x * Math.cos(yaw) - z * Math.sin(yaw);
          const rotatedZ = x * Math.sin(yaw) + z * Math.cos(yaw);
          const rotatedY = y * Math.cos(tilt) - rotatedZ * Math.sin(tilt);
          const depth = y * Math.sin(tilt) + rotatedZ * Math.cos(tilt);
          const perspective = 0.88 + (depth / radius) * 0.12;
          const pointX = centerX + rotatedX * perspective;
          const pointY = centerY + rotatedY * perspective;
          if (index === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        }

        const hue = 191 + Math.sin(longitude * 2 + elapsed * 0.35) * 12;
        context.strokeStyle = `hsla(${hue}, 100%, 73%, ${0.12 + pulse * 0.11})`;
        context.lineWidth = 0.55 + pulse * 0.5;
        context.shadowBlur = 5 + pulse * 10;
        context.shadowColor = "rgba(51, 194, 255, 0.78)";
        context.stroke();
      };

      for (let index = 0; index < 27; index += 1) {
        const latitude = -1.43 + (index / 26) * 2.86;
        drawFilament(latitude, index * 0.38, false);
      }
      for (let index = 0; index < 18; index += 1) {
        const longitude = -1.38 + (index / 17) * 2.76;
        drawFilament(index * 0.35, longitude, true);
      }

      context.shadowBlur = 11 + pulse * 14;
      context.fillStyle = `rgba(120, 229, 255, ${0.58 + pulse * 0.32})`;
      for (let index = 0; index < 12; index += 1) {
        const angle = index * 2.399 + elapsed * (0.12 + pulse * 0.14);
        const distance = radius * (0.76 + Math.sin(index * 1.9 + elapsed) * 0.08);
        context.beginPath();
        context.arc(
          centerX + Math.cos(angle) * distance,
          centerY + Math.sin(angle * 1.13) * distance,
          0.8 + pulse * 1.2,
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
      <div className="core-orbit core-orbit--outer" aria-hidden="true">
        <span className="core-orbit__particle" />
      </div>
      <div className="core-orbit core-orbit--middle" aria-hidden="true">
        <span className="core-orbit__particle" />
      </div>
      <div className="core-orbit core-orbit--inner" aria-hidden="true">
        <span className="core-orbit__particle" />
      </div>
      <div className="core-orbit core-orbit--near" aria-hidden="true">
        <span className="core-orbit__particle" />
      </div>
      <div className="core">
        <div className="core__shine" />
        <div className="core__energy" aria-hidden="true" />
        <canvas className="core__filaments" ref={canvasRef} aria-hidden="true" />
        <span className="core__mark">
          <NexusMark />
        </span>
      </div>
    </div>
  );
}
