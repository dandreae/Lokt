import type { ComponentProps } from 'react';
import type { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export type SubjectIcon =
  | { family: 'ionicons'; name: ComponentProps<typeof Ionicons>['name'] }
  | { family: 'material'; name: ComponentProps<typeof MaterialCommunityIcons>['name'] };

const KEYWORD_ICONS: [RegExp, SubjectIcon][] = [
  [/math|calc|algebra|geometry|statistic/i, { family: 'material', name: 'calculator-variant' }],
  [/phys|chem|bio|science|lab/i, { family: 'material', name: 'atom' }],
  [/(^|\W)cs(\W|$)|comput|code|program|software|algorithm/i, { family: 'ionicons', name: 'code-slash' }],
  [/lit|read|english|essay|write|writing/i, { family: 'ionicons', name: 'book' }],
  [/spanish|french|german|language|vocab|japanese|mandarin|chinese/i, { family: 'ionicons', name: 'chatbubbles' }],
  [/histor|social|geograph|econ/i, { family: 'ionicons', name: 'globe' }],
  [/art|design|music|draw/i, { family: 'ionicons', name: 'color-palette' }],
  [/law|legal/i, { family: 'ionicons', name: 'briefcase' }],
  [/health|medic|anatomy/i, { family: 'material', name: 'medical-bag' }],
];

// Deterministic, presentational-only icon guess from a task's label — no
// schema change, purely derived like avatar-color hashing.
export function getSubjectIcon(label: string): SubjectIcon {
  for (const [pattern, icon] of KEYWORD_ICONS) {
    if (pattern.test(label)) return icon;
  }
  return { family: 'ionicons', name: 'bookmark' };
}
