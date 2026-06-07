export const MOOD_ICON_COLOR: Record<string, string> = {
  calm:       '#68a8cc',
  restless:   '#b85880',
  melancholy: '#6868b0',
  euphoric:   '#b89020',
  eerie:      '#4888a8',
  warm:       '#b86030',
  cold:       '#58a0c0',
  vast:       '#6868a0',
  intimate:   '#a04870',
  electric:   '#7848b8',
};

export function MoodIcon({ mood, size = 32 }: { mood: string; size?: number }) {
  const c = MOOD_ICON_COLOR[mood] ?? '#8868a8';
  const v = size;
  const h = size / 2;

  switch (mood) {
    case 'calm':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="4"  stroke={c} strokeWidth="1.8"/>
          <circle cx="16" cy="16" r="9"  stroke={c} strokeWidth="1.2" opacity="0.5"/>
          <circle cx="16" cy="16" r="14" stroke={c} strokeWidth="0.8" opacity="0.22"/>
        </svg>
      );
    case 'restless':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M16 4C22 4 27 8.5 27 15C27 21.5 22 26 16 26C10 26 5 21.5 5 15C5 11 7 7.5 11 6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="23" cy="8.5" r="2.2" fill={c} opacity="0.6"/>
        </svg>
      );
    case 'melancholy':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M16 4C16 4 8 15 8 20.5C8 24.5 11.5 28 16 28C20.5 28 24 24.5 24 20.5C24 15 16 4 16 4Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M12 21Q16 24 20 21" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity="0.5"/>
        </svg>
      );
    case 'euphoric':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M16 2L17.7 12L27 16L17.7 20L16 30L14.3 20L5 16L14.3 12Z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
          <circle cx="7"  cy="7"  r="1.8" fill={c} opacity="0.5"/>
          <circle cx="25" cy="7"  r="1.2" fill={c} opacity="0.4"/>
          <circle cx="25" cy="25" r="1.6" fill={c} opacity="0.5"/>
        </svg>
      );
    case 'eerie':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M21 4C14 7 8 12.5 8 19C8 25.5 14.5 30 22.5 28C16.5 26 12 22 12 17C12 12.5 15.5 8.5 21 4Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
          <circle cx="25" cy="9"  r="1.7" fill={c} opacity="0.55"/>
          <circle cx="27" cy="15" r="1.1" fill={c} opacity="0.38"/>
        </svg>
      );
    case 'warm':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M16 29C10 29 7.5 22 9.5 17C11 14 11.5 11 11.5 8.5C11.5 8.5 14 11.5 14 14.5C14 14.5 16 11.5 16 7C16 7 21 13.5 21 17.5C21 13.5 23 11 23 11C23 15 25.5 20 23.5 25C22.5 27.5 20 29 16 29Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      );
    case 'cold':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <line x1="16" y1="2"  x2="16" y2="30" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="2"  y1="16" x2="30" y2="16" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="6"  y1="6"  x2="26" y2="26" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="26" y1="6"  x2="6"  y2="26" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="16" cy="16" r="3" fill={c}/>
        </svg>
      );
    case 'vast':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M2 23Q16 7 30 23"  stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M6 28Q16 14 26 28" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.55"/>
          <path d="M1 19Q16 3 31 19"  stroke={c} strokeWidth="0.8" strokeLinecap="round" opacity="0.28"/>
        </svg>
      );
    case 'intimate':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M16 25C14 20 6 17 6 11.5C6 8.5 8.5 6.5 11 6.5C13 6.5 14.8 7.8 16 10C17.2 7.8 19 6.5 21 6.5C23.5 6.5 26 8.5 26 11.5C26 17 18 20 16 25Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      );
    case 'electric':
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <path d="M20 2L11 17H17L12 30L24 12H18L20 2Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return (
        <svg width={v} height={v} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="7" stroke={c} strokeWidth="1.8" opacity="0.7"/>
        </svg>
      );
  }
}
