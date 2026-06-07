'use client';

// 3D shading: radial-gradient with highlight → midtone → deep shadow
// The light source is fixed at upper-left (34% 28%)
const MODEL_STYLES: Record<string, {
  sphere: string;
  glow: string;
  glowFlash: string;
  label: string;
}> = {
  claude: {
    sphere: 'radial-gradient(circle at 34% 28%, #ffe5d0 0%, #d4845a 42%, #7a3520 100%)',
    glow:      'rgba(210, 130, 85,  0.45)',
    glowFlash: 'rgba(230, 160, 110, 0.85)',
    label: 'Claude',
  },
  gpt: {
    sphere: 'radial-gradient(circle at 34% 28%, #daf0ff 0%, #5590bb 42%, #1e4870 100%)',
    glow:      'rgba(80,  155, 200, 0.42)',
    glowFlash: 'rgba(130, 195, 240, 0.85)',
    label: 'GPT',
  },
  gemini: {
    sphere: 'radial-gradient(circle at 34% 28%, #eedeff 0%, #8855bb 42%, #3a1870 100%)',
    glow:      'rgba(140, 95,  210, 0.42)',
    glowFlash: 'rgba(185, 145, 255, 0.85)',
    label: 'Gemini',
  },
};

// Triangle formation: Claude top-left, GPT top-right, Gemini center
const POSITIONS: Record<string, { x: number; y: number }> = {
  claude: { x: 22, y: 40 },
  gpt:    { x: 78, y: 40 },
  gemini: { x: 50, y: 58 },
};

const MOOD_SCALE: Record<string, number> = {
  vast:     1.16,
  intimate: 0.88,
  electric: 1.10,
  euphoric: 1.07,
  eerie:    0.93,
};

// Blurred colored halo that shifts with mood — visible color wash around each blob
const MOOD_HALO: Record<string, string> = {
  calm:       'rgba(90,  168, 218, 0.78)',
  restless:   'rgba(215, 72,  138, 0.78)',
  melancholy: 'rgba(108, 105, 205, 0.78)',
  euphoric:   'rgba(225, 192, 30,  0.78)',
  eerie:      'rgba(42,  138, 180, 0.78)',
  warm:       'rgba(225, 118, 48,  0.78)',
  cold:       'rgba(80,  175, 225, 0.78)',
  vast:       'rgba(108, 115, 192, 0.78)',
  intimate:   'rgba(192, 58,  142, 0.78)',
  electric:   'rgba(128, 58,  215, 0.78)',
};

interface BlobProps {
  model: 'claude' | 'gpt' | 'gemini';
  currentMood: string;
  isFlashing?: boolean;
}

export function Blob({ model, currentMood, isFlashing = false }: BlobProps) {
  const { sphere, glow, glowFlash, label } = MODEL_STYLES[model];
  const pos   = POSITIONS[model];
  const scale = MOOD_SCALE[currentMood] ?? 1.0;

  return (
    <div
      className="model-avatar"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      <div className="model-avatar__orb-wrap">
        <div
          className="model-avatar__mood-halo"
          style={{ background: MOOD_HALO[currentMood] ?? 'rgba(128, 128, 180, 0.5)' }}
        />
        <div
          className={`model-avatar__orb model-avatar__orb--${model}`}
          style={{
            background: sphere,
            boxShadow: isFlashing
              ? `0 0 55px 22px ${glowFlash}, 0 0 95px 40px ${glow}, inset 0 3px 10px rgba(255,255,255,0.65)`
              : `0 0 35px 14px ${glow}, inset 0 3px 10px rgba(255,255,255,0.48)`,
            transform:  `scale(${scale})`,
            filter: isFlashing ? 'brightness(1.25) saturate(1.3)' : 'none',
            transition: isFlashing
              ? 'none'
              : 'box-shadow 400ms ease-out, filter 400ms ease-out, transform 2000ms ease-in-out',
          }}
        />
      </div>
      <span className="model-avatar__name">
        <span className="model-avatar__name-badge">{label}</span>
      </span>
    </div>
  );
}
