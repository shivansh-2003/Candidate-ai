'use client';

import { useEffect, useRef } from 'react';
import { AnalyzerData } from './hooks/useAudioAnalyzer';

type Props = {
  data: AnalyzerData | null;
  size?: number; // px
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
};

export default function RadialVisualizer({ data, size = 360, state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dprRef = useRef<number>(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf: number | null = null;
    const render = () => {
      const w = canvas.width / (dprRef.current || 1);
      const h = canvas.height / (dprRef.current || 1);
      ctx.clearRect(0, 0, w, h);

      // Background subtle glow
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.32;

      // Colors per state
      const colorMap: Record<Props['state'], [string, string]> = {
        idle: ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)'],
        listening: ['#34d399', '#22c55e'],
        thinking: ['#fbbf24', '#f59e0b'],
        speaking: ['#60a5fa', '#8b5cf6'],
      };
      const [c1, c2] = colorMap[state];

      // Draw concentric rings with slight time-domain influence (brighter)
      const rings = 4;
      for (let r = 0; r < rings; r++) {
        const radius = baseRadius + r * 14;
        ctx.beginPath();
        const grad = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 0.26 - r * 0.04;
        ctx.lineWidth = 6.5 - r * 0.8;

        const steps = 128;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const ang = t * Math.PI * 2;
          const amp =
            data?.time?.length
              ? (data.time[Math.floor((i / steps) * data.time.length)] - 128) / 128
              : 0;
          const wobble = amp * (state === 'speaking' ? 8 : state === 'listening' ? 6 : 3);
          const x = cx + Math.cos(ang) * (radius + wobble);
          const y = cy + Math.sin(ang) * (radius + wobble);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // Outer glow pulse by level
      const level = data?.level ?? 0.05;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius + 64 + level * 40, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 1;
      ctx.stroke();

      // Center core
      const core = baseRadius * 0.38 + level * (state === 'speaking' ? 14 : 8);
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
      cg.addColorStop(0, 'rgba(255,255,255,0.95)');
      cg.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.beginPath();
      ctx.arc(cx, cy, core, 0, Math.PI * 2);
      ctx.fillStyle = cg;
      ctx.fill();

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [data, size, state]);

  return <canvas ref={canvasRef} aria-hidden />;
}


