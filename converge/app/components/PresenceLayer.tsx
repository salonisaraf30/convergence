'use client';

import type { Viewer } from '../../src/module_bindings/types';

function identityToEdgePos(hexString: string): { left: string; top: string } {
  // Use last 8 hex chars → float 0–1 → position along perimeter
  const n = parseInt(hexString.slice(-8), 16) / 0xffffffff;
  const p = n * 4; // 0–4 along the four edges

  if (p < 1)      return { left: `${p * 100}%`,           top: '0%'   };
  if (p < 2)      return { left: '100%',                  top: `${(p - 1) * 100}%` };
  if (p < 3)      return { left: `${(3 - p) * 100}%`,     top: '100%' };
                  return { left: '0%',                    top: `${(4 - p) * 100}%` };
}

function seedToColor(colorSeed: number): string {
  const hue = colorSeed % 360;
  return `hsl(${hue}, 45%, 62%)`;
}

export function PresenceLayer({ viewers }: { viewers: Viewer[] }) {
  if (viewers.length === 0) return null;

  return (
    <>
      {viewers.map(viewer => {
        const hex   = viewer.identity.toHexString();
        const pos   = identityToEdgePos(hex);
        const color = seedToColor(viewer.colorSeed);
        return (
          <div
            key={hex}
            className="presence-dot"
            style={{
              left:      pos.left,
              top:       pos.top,
              background: color,
              boxShadow: `0 0 8px 3px ${color}55`,
            }}
          />
        );
      })}
      <div className="presence-count">
        {viewers.length} {viewers.length === 1 ? 'watching' : 'watching'}
      </div>
    </>
  );
}
