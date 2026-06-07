'use client';

import React from 'react';
import type { Thought } from '../../src/module_bindings/types';

const POSITIONS: Record<string, { x: number; y: number }> = {
  claude: { x: 22, y: 40 },
  gpt:    { x: 78, y: 40 },
  gemini: { x: 50, y: 58 },
};

// Model-stable offsets: each model's thought ALWAYS appears at the same
// position relative to its blob, so successive thoughts crossfade in-place
// rather than popping in at different locations.
const MODEL_BUBBLE_OFFSET: Record<string, { dx: number; dy: number }> = {
  claude:  { dx:  88, dy: -134 },   // up and right (blob is on the left)
  gpt:     { dx: -88, dy: -134 },   // up and left  (blob is on the right)
  gemini:  { dx:   0, dy: -150 },   // straight up   (blob is in the center)
};

const MOOD_TINT: Record<string, string> = {
  calm:       'rgba(160, 205, 240, 0.28)',
  restless:   'rgba(225, 145, 185, 0.28)',
  melancholy: 'rgba(150, 148, 228, 0.28)',
  euphoric:   'rgba(248, 228, 108, 0.28)',
  eerie:      'rgba(128, 188, 215, 0.28)',
  warm:       'rgba(248, 178, 138, 0.28)',
  cold:       'rgba(148, 212, 245, 0.28)',
  vast:       'rgba(162, 162, 222, 0.28)',
  intimate:   'rgba(222, 155, 195, 0.28)',
  electric:   'rgba(180, 148, 250, 0.30)',
};

interface ThoughtCloudProps {
  thought: Thought;
  age: number;
  isRetiring?: boolean;
}

export function ThoughtCloud({ thought, age, isRetiring = false }: ThoughtCloudProps) {
  const blobPos = POSITIONS[thought.model] ?? POSITIONS.claude;
  const { dx, dy } = MODEL_BUBBLE_OFFSET[thought.model] ?? MODEL_BUBBLE_OFFSET.claude;

  // Retiring: fade immediately. Natural expiry: 800ms before the 20s window closes.
  const isVanishing = isRetiring || age >= 19200;

  // Hard cap at 9 words — matches the <10 word backend constraint
  const words = thought.text.trim().split(/\s+/);
  const displayText = words.length > 9
    ? words.slice(0, 9).join(' ') + '…'
    : thought.text;

  const moodTint = MOOD_TINT[thought.mood] ?? 'transparent';

  return (
    <div
      className="thought-cloud-group"
      style={{
        left:   `${blobPos.x}%`,
        top:    `${blobPos.y}%`,
        // retiring sits behind the incoming thought
        zIndex: isRetiring ? 3 : 4,
      }}
    >
      <div
        className={`thought-cloud ${isVanishing ? 'thought-cloud--out' : ''}`}
        style={{ translate: `calc(-50% + ${dx}px) calc(-50% + ${dy}px)` } as React.CSSProperties}
      >
        <div
          className="thought-bubble"
          style={{
            background: `linear-gradient(155deg, rgba(255,255,255,0.97) 45%, ${moodTint})`,
          }}
        >
          {thought.latchWord && (
            <span className="thought-latch">← {thought.latchWord}</span>
          )}
          <p className="thought-text">{displayText}</p>
        </div>
      </div>
    </div>
  );
}
