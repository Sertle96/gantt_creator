const HEX = /^#([0-9a-f]{6})$/i;

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Lightens very dark colours on the dark theme so bars and chips stay visible.
 * Stored colours are not changed; non-hex values (CSS variables) pass through.
 */
export function legible(color: string, dark: boolean): string {
  if (!dark || !HEX.test(color)) return color;
  const l = luminance(color);
  if (l >= 0.16) return color;
  const mix = l < 0.05 ? 0.55 : 0.4;
  const out = channels(color).map((c) => Math.round(c + (255 - c) * mix));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
