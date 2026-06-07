'use client';

import { useEffect, useRef } from 'react';
import type { Thought } from '../../src/module_bindings/types';

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      ctx.fillText(line.trim(), x, yy);
      line = word + ' ';
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), x, yy);
}

// Cheap deterministic scatter — two different LCG steps from the same seed
function seededPos(seed: number, w: number, h: number): { x: number; y: number } {
  const a = ((seed * 1664525 + 1013904223) & 0xffffff) / 0xffffff;
  const b = ((seed * 22695477 + 1)          & 0xffffff) / 0xffffff;
  // Keep away from very edges so text doesn't half-clip
  return {
    x: a * (w * 0.82) + w * 0.09,
    y: b * (h * 0.72) + h * 0.12,
  };
}

export function ResidueLayer({ retiredThoughts }: { retiredThoughts: Thought[] }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const paintedIds = useRef(new Set<bigint>());

  // Size once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }, []);

  // Paint each newly retired thought exactly once at a random scatter position
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || retiredThoughts.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (const t of retiredThoughts) {
      if (paintedIds.current.has(t.id)) continue;
      paintedIds.current.add(t.id);

      const seed      = Number(t.id % 0xffffffn);
      const { x, y } = seededPos(seed, canvas.width, canvas.height);

      // Higher opacity here — CSS blur will spread and soften it
      ctx.fillStyle = 'rgba(38, 18, 72, 0.55)';
      ctx.font      = "14px 'Cormorant Garamond', Georgia, serif";
      wrapText(ctx, t.text, x, y, 200, 18);
    }
  }, [retiredThoughts]);

  return <canvas ref={canvasRef} className="residue-layer" />;
}
