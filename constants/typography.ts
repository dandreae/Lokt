// Typography system for Lokt
//
// Display (Nunito-Black): 32px+ page titles only
// Mono (DMMono-Medium): all numeric and timer displays
// System: everything else — SF Pro on iOS, system on Android

export const DISPLAY = 'Nunito-Black';
export const MONO    = 'DMMono-Medium';

// Font weights for the system font
export const W = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
};

// Standard section label: uppercase, spaced, muted
export const sectionLabel = {
  fontWeight: W.semibold,
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: 'uppercase' as const,
};

// Standard card padding
export const CARD_PADDING = 16;

// Standard border radius values
export const R = {
  sm:   8,
  md:   12,
  lg:   14,
  full: 100,
} as const;

// Standard spacing
export const S = {
  xs:      4,
  sm:      8,
  md:     12,
  lg:     16,
  xl:     20,
  xxl:    24,
  section:32,
} as const;
