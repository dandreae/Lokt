// Lokt design system — single source of truth for color, type, spacing,
// radii, and motion. Dark-mode only for now; semantic names so a light
// theme can be added later without touching consumer screens.

import { StyleSheet, type TextStyle } from 'react-native';

// ─── Palette (raw values) ──────────────────────────────────────────────────

const palette = {
  black0: '#0D1117',
  black1: '#161B22',
  black2: '#1C2128',
  black3: '#21262D',
  grayLine: '#30363D',
  white0: '#F0F6FC',
  gray1: '#8B949E',
  gray2: '#484F58',
  emerald: '#3FAF72',
  mint: '#58D68D',
  blue: '#6cb4f7',
  amber: '#E09B3D',
  red: '#F85149',
  gold: '#D4B840',
  silver: '#B8C0CC',
  bronze: '#C97F4B',
  pureWhite: '#FFFFFF',
} as const;

// ─── Semantic colors ────────────────────────────────────────────────────────

export const colors = {
  backgroundPrimary: palette.black0,
  backgroundSecondary: palette.black1,
  surfaceRaised: palette.black1,
  surfaceSunken: palette.black2,
  surfaceActive: palette.black3,

  textPrimary: palette.white0,
  textSecondary: palette.gray1,
  textMuted: palette.gray2,
  textOnAccent: palette.pureWhite,

  accentPrimary: palette.emerald,
  accentSecondary: palette.mint,
  focus: palette.blue,

  success: palette.mint,
  warning: palette.amber,
  destructive: palette.red,
  rankGold: palette.gold,
  rankSilver: palette.silver,
  rankBronze: palette.bronze,

  divider: palette.grayLine,
  border: palette.grayLine,
  progressTrack: palette.black3,
  progressFill: palette.emerald,

  overlay: 'rgba(0,0,0,0.5)',
} as const;

// ─── Spacing (4pt system) ───────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
} as const;

// ─── Radii — three sizes + full/pill ────────────────────────────────────────

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const borderWidths = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
  thick: 2,
} as const;

// ─── Icon sizing ────────────────────────────────────────────────────────────

export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

// ─── Component heights ──────────────────────────────────────────────────────

export const componentHeights = {
  input: 48,
  button: 52,
  buttonCompact: 40,
  row: 56,
  tabBar: 58,
  chip: 36,
  touchTarget: 44,
} as const;

// ─── Motion ─────────────────────────────────────────────────────────────────

export const durations = {
  fast: 150,
  base: 250,
  slow: 400,
} as const;

// ─── Shadows ────────────────────────────────────────────────────────────────
// Centralized so screens never hand-roll shadow values. `soft` is the
// neutral default for raised surfaces; `tinted` produces a restrained
// colored glow (e.g. a task's own color) for screens that opt into more
// depth — keep opacity/radius here, not scattered per-screen.

export const shadows = {
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  tinted: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  }),
} as const;

// ─── Fonts ──────────────────────────────────────────────────────────────────

export const fonts = {
  display: 'Nunito-Black',
  mono: 'DMMono-Medium',
} as const;

// ─── Type scale ─────────────────────────────────────────────────────────────
// System font (no fontFamily override) for everything except display
// titles (Nunito-Black) and numeric/timer values (DM Mono, tabular).

type TS = TextStyle;

export const type: Record<string, TS> = {
  // Large page titles — Home greeting isn't one of these; tab screens
  // (Friends, Tasks, Profile) that need a big display title use this.
  display: { fontFamily: fonts.display, fontSize: 30, color: colors.textPrimary },

  // The dominant number inside the study ring.
  timerLarge: { fontFamily: fonts.mono, fontSize: 56, color: colors.textPrimary, letterSpacing: -1 },
  timerMedium: { fontFamily: fonts.mono, fontSize: 40, color: colors.textPrimary, letterSpacing: -0.5 },

  // Header title for back-button screens (settings, timer, stopwatch, task detail, group detail).
  screenTitle: { fontWeight: '700', fontSize: 18, color: colors.textPrimary },

  // Uppercase section label used above grouped content.
  sectionTitle: {
    fontWeight: '600',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Leaderboard / rank numerals — tabular so columns align.
  rankValue: { fontFamily: fonts.mono, fontSize: 14, color: colors.textSecondary },
  statValue: { fontFamily: fonts.mono, fontSize: 15, color: colors.textPrimary },

  name: { fontWeight: '600', fontSize: 15, color: colors.textPrimary },
  body: { fontWeight: '400', fontSize: 15, color: colors.textPrimary },
  bodyMedium: { fontWeight: '500', fontSize: 14, color: colors.textPrimary },
  meta: { fontWeight: '400', fontSize: 12, color: colors.textMuted },

  button: { fontWeight: '600', fontSize: 16, color: colors.textOnAccent },
  buttonCompact: { fontWeight: '600', fontSize: 14 },

  navLabel: { fontWeight: '500', fontSize: 10, letterSpacing: 0.1 },
  settingsLabel: { fontWeight: '400', fontSize: 16, color: colors.textPrimary },
  helper: { fontWeight: '400', fontSize: 12, color: colors.textMuted, lineHeight: 16 },
};

export const theme = { colors, spacing, radii, borderWidths, iconSizes, componentHeights, durations, shadows, fonts, type };
export default theme;
