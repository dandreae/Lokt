export function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#0a0a0a' : '#ffffff';
}

// Returns a dark-tinted card background derived from a task color.
// active = true (task has sessions this week) yields a slightly richer tint.
export function darkCardBg(hex: string, active = false): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#111118';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const br = 13, bg = 17, bb = 23; // dark base matching #0D1117
  const t = active ? 0.28 : 0.20;
  return `rgb(${Math.round(r * t + br * (1 - t))},${Math.round(g * t + bg * (1 - t))},${Math.round(b * t + bb * (1 - t))})`;
}
