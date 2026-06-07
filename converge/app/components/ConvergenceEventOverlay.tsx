'use client';

import type { ConvergenceEvent } from '../../src/module_bindings/types';

// More saturated versions — legible as a ring/flash on a light sky background
const MOOD_TINTS: Record<string, string> = {
  calm:       '#7ab8e0',
  restless:   '#d878a8',
  melancholy: '#8888d0',
  euphoric:   '#c8c860',
  eerie:      '#68a8c8',
  warm:       '#d89870',
  cold:       '#78c0e0',
  vast:       '#9898c8',
  intimate:   '#c07898',
  electric:   '#9878d8',
};

export function ConvergenceEventOverlay({ event }: { event: ConvergenceEvent }) {
  const tint = MOOD_TINTS[event.mood] ?? '#9898b8';

  return (
    <>
      <div
        className="convergence-flash"
        style={{ background: tint }}
      />
      <div
        className="convergence-ring"
        style={{ borderColor: tint }}
      />
      <p className="convergence-label">
        the three are dreaming the same dream — {event.mood}
      </p>
    </>
  );
}
