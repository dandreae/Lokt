import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { SubjectIcon as SubjectIconType } from '../utils/subjectIcon';

type Props = { icon: SubjectIconType; size: number; color: string };

export function SubjectIcon({ icon, size, color }: Props) {
  if (icon.family === 'material') {
    return <MaterialCommunityIcons name={icon.name} size={size} color={color} />;
  }
  return <Ionicons name={icon.name} size={size} color={color} />;
}
