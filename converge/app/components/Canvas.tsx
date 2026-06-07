'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConvergenceState } from '../hooks/useConvergenceState';
import { Blob } from './Blob';
import { ThoughtCloud } from './ThoughtCloud';
import { MoodIcon } from './MoodIcon';
import { CloudLayer } from './CloudLayer';
import { ResidueLayer } from './ResidueLayer';
import { ConvergenceEventOverlay } from './ConvergenceEventOverlay';
import { PresenceLayer } from './PresenceLayer';
import type { ConvergenceEvent, Thought } from '../../src/module_bindings/types';

type Model = 'claude' | 'gpt' | 'gemini';
const MODELS: Model[] = ['claude', 'gpt', 'gemini'];

const MOOD_TINTS: Record<string, string> = {
  calm:       'rgba(135, 198, 242, 0.62)',
  restless:   'rgba(224, 76,  148, 0.60)',
  melancholy: 'rgba(126, 126, 222, 0.62)',
  euphoric:   'rgba(242, 216, 62,  0.62)',
  eerie:      'rgba(62,  176, 218, 0.60)',
  warm:       'rgba(246, 142, 78,  0.62)',
  cold:       'rgba(104, 204, 246, 0.62)',
  vast:       'rgba(136, 142, 222, 0.62)',
  intimate:   'rgba(224, 104, 176, 0.62)',
  electric:   'rgba(154, 94,  250, 0.62)',
};

// Ambient aura colors — screen-blended so overlapping moods produce mixed hues
const MOOD_AURA: Record<string, string> = {
  calm:       'rgba(42,  138, 218, 0.72)',
  restless:   'rgba(218, 36,  126, 0.72)',
  melancholy: 'rgba(86,  78,  214, 0.72)',
  euphoric:   'rgba(228, 184, 0,   0.72)',
  eerie:      'rgba(8,   128, 184, 0.72)',
  warm:       'rgba(226, 92,  12,  0.72)',
  cold:       'rgba(42,  164, 230, 0.72)',
  vast:       'rgba(82,  96,  198, 0.72)',
  intimate:   'rgba(192, 24,  126, 0.72)',
  electric:   'rgba(118, 30,  226, 0.72)',
};

// Canvas-level aura layer: one large screen-blended circle per model.
// Because they share a stacking context with mix-blend-mode: screen,
// overlapping areas genuinely merge their hues (like colored stage lights).
function AuraLayer({ moods }: { moods: Record<string, string> }) {
  return (
    <div className="aura-layer" aria-hidden="true">
      {(Object.keys(BLOB_POS) as Model[]).map(model => (
        <div
          key={model}
          className="aura-blob"
          style={{
            left:       `${BLOB_POS[model].x}%`,
            top:        `${BLOB_POS[model].y}%`,
            background: MOOD_AURA[moods[model]] ?? 'rgba(128,128,200,0.7)',
          }}
        />
      ))}
    </div>
  );
}

const DEFAULT_MOODS: Record<Model, string> = {
  claude: 'calm',
  gpt:    'vast',
  gemini: 'eerie',
};

// Must stay in sync with Blob.tsx and ThoughtCloud.tsx
const BLOB_POS: Record<string, { x: number; y: number }> = {
  claude: { x: 22, y: 40 },
  gpt:    { x: 78, y: 40 },
  gemini: { x: 50, y: 58 },
};

// 8 float positions (px from blob center) for floating mood icons
const FLOAT_OFFSETS: [number, number][] = [
  [ 68, -42],
  [-58, -50],
  [ 75,  18],
  [-70,  22],
  [ 20, -75],
  [-25,  68],
  [ 52, -68],
  [-72, -18],
];

// How long a retiring bubble stays visible after being replaced (overlap window)
// Must be longer than the bubble-out animation (1.8s) so it completes before unmount
const RETIRE_SHOW_MS = 2500;

function FloatingMoodIcon({
  thought,
  age,
  isRetiring,
}: {
  thought: Thought;
  age: number;
  isRetiring: boolean;
}) {
  const pos  = BLOB_POS[thought.model] ?? BLOB_POS.claude;
  const seed = Number(thought.id % 8n);
  const [offsetX, offsetY] = FLOAT_OFFSETS[seed];
  const isVanishing = isRetiring || age >= 18800;

  return (
    <div
      className={`floating-mood-icon${isVanishing ? ' floating-mood-icon--out' : ''}`}
      style={{
        left: `${pos.x}%`,
        top:  `${pos.y}%`,
        translate: `calc(-50% + ${offsetX}px) calc(-50% + ${offsetY}px)`,
      } as React.CSSProperties}
    >
      <MoodIcon mood={thought.mood} size={28} />
    </div>
  );
}

function createdMs(thought: Thought): number {
  return Number(thought.createdAt.microsSinceUnixEpoch / 1000n);
}

function latestMoodFor(thoughts: Thought[], model: string): string | null {
  let best: Thought | null = null;
  for (const t of thoughts) {
    if (t.model !== model) continue;
    if (!best || t.tick > best.tick) best = t;
  }
  return best?.mood ?? null;
}

function buildBackgroundGradient(moods: Record<Model, string>): string {
  const c = MOOD_TINTS[moods.claude] ?? 'transparent';
  const g = MOOD_TINTS[moods.gpt]    ?? 'transparent';
  const m = MOOD_TINTS[moods.gemini] ?? 'transparent';
  return [
    `radial-gradient(circle at 22% 40%, ${c} 0%, ${c} 28%, transparent 70%)`,
    `radial-gradient(circle at 78% 40%, ${g} 0%, ${g} 28%, transparent 70%)`,
    `radial-gradient(circle at 50% 58%, ${m} 0%, ${m} 30%, transparent 74%)`,
  ].join(', ');
}

const ACTIVE_MS  = 20_000;
const RETIRED_MS = 20_000;

export function Canvas() {
  const { thoughts, convergences, viewers, session } = useConvergenceState();
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const [activeConvergence, setActiveConvergence] = useState<{
    event: ConvergenceEvent;
    detectedAt: number;
  } | null>(null);
  const prevConvergenceId = useRef<bigint | null>(null);

  useEffect(() => {
    if (convergences.length === 0) return;
    const latest = convergences.reduce((a, b) => (a.tick > b.tick ? a : b));
    if (latest.id !== prevConvergenceId.current) {
      prevConvergenceId.current = latest.id;
      setActiveConvergence({ event: latest, detectedAt: Date.now() });
    }
  }, [convergences]);

  const sinceConvergence = now && activeConvergence ? now - activeConvergence.detectedAt : Infinity;
  const convergenceToShow = sinceConvergence < 3000 ? activeConvergence?.event ?? null : null;
  const isFlashing        = sinceConvergence < 600;

  const currentMoods = useMemo<Record<Model, string>>(() => ({
    claude: latestMoodFor(thoughts, 'claude') ?? DEFAULT_MOODS.claude,
    gpt:    latestMoodFor(thoughts, 'gpt')    ?? DEFAULT_MOODS.gpt,
    gemini: latestMoodFor(thoughts, 'gemini') ?? DEFAULT_MOODS.gemini,
  }), [thoughts]);

  const sessionThoughts = useMemo(
    () => session ? thoughts.filter(t => t.sessionId === session.id) : [],
    [thoughts, session],
  );

  // Per model: show the newest thought (normal) + the previous one briefly (retiring)
  // so the old bubble fades while the new one appears — creates a smooth train-of-thought overlap
  const activeThoughts = useMemo(() => {
    const byModel: Record<string, Thought[]> = {};
    for (const t of sessionThoughts) {
      if (!now || now - createdMs(t) >= ACTIVE_MS) continue;
      if (!byModel[t.model]) byModel[t.model] = [];
      byModel[t.model].push(t);
    }
    const result: Array<{ thought: Thought; isRetiring: boolean }> = [];
    for (const thoughts of Object.values(byModel)) {
      const sorted = [...thoughts].sort((a, b) => Number(b.tick - a.tick));
      const newest = sorted[0];
      const prev   = sorted[1];
      if (prev) {
        // Retiring thought pushed FIRST → sits behind the new one in DOM stacking
        const timeSinceReplaced = now - createdMs(newest);
        if (timeSinceReplaced < RETIRE_SHOW_MS) {
          result.push({ thought: prev, isRetiring: true });
        }
      }
      // New thought pushed LAST → paints on top during the crossfade
      if (newest) result.push({ thought: newest, isRetiring: false });
    }
    return result;
  }, [sessionThoughts, now]);

  const retiredThoughts = useMemo(
    () => now ? sessionThoughts.filter(t => now - createdMs(t) >= RETIRED_MS) : [],
    [sessionThoughts, now],
  );

  const hasSession = session !== null;

  return (
    <div className="app-canvas" aria-hidden="true">
      <div
        className="app-canvas__mood"
        style={{ background: buildBackgroundGradient(currentMoods) }}
      />
      <div className="app-canvas__surface" />
      <CloudLayer />
      <AuraLayer moods={currentMoods} />

      {!hasSession && (
        <div className="canvas-intro">
          <p className="canvas-intro__title">three minds, one void</p>
          <p className="canvas-intro__sub">Claude · GPT · Gemini · dreaming together</p>
        </div>
      )}

      {hasSession && <ResidueLayer retiredThoughts={retiredThoughts} />}

      {MODELS.map(model => (
        <Blob
          key={model}
          model={model}
          currentMood={currentMoods[model]}
          isFlashing={isFlashing}
        />
      ))}

      {hasSession && activeThoughts.map(({ thought, isRetiring }) => (
        <ThoughtCloud
          key={String(thought.id)}
          thought={thought}
          age={now - createdMs(thought)}
          isRetiring={isRetiring}
        />
      ))}

      {/* Floating mood icons — independent of bubbles */}
      {hasSession && activeThoughts.map(({ thought, isRetiring }) => (
        <FloatingMoodIcon
          key={`icon-${String(thought.id)}`}
          thought={thought}
          age={now - createdMs(thought)}
          isRetiring={isRetiring}
        />
      ))}

      {convergenceToShow && (
        <ConvergenceEventOverlay
          key={String(convergenceToShow.id)}
          event={convergenceToShow}
        />
      )}
      <PresenceLayer viewers={viewers} />
    </div>
  );
}
