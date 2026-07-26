import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, componentHeights, iconSizes, spacing, type } from '../constants/theme';
import { IconButton } from './IconButton';

type BarProps = {
  variant?: 'bar';
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
};

type LargeProps = {
  variant: 'large';
  title: string;
  right?: React.ReactNode;
};

type Props = BarProps | LargeProps;

// One header pattern for the whole app:
// - "bar": back button + centered-ish title (+ optional subtitle) + right
//   slot. Used on detail/modal/settings screens (Settings, Timer,
//   Stopwatch, Task Detail, Group Detail, New Group).
// - "large": big display title inline in the scroll content, optional
//   right action. Used on primary tab screens (Friends, Tasks, Profile).
export function AppHeader(props: Props) {
  if (props.variant === 'large') {
    return (
      <View style={styles.largeRow}>
        <Text style={type.display}>{props.title}</Text>
        {props.right}
      </View>
    );
  }

  const { title, subtitle, onBack, right } = props;
  return (
    <View style={styles.bar}>
      <IconButton icon="chevron-back" onPress={onBack} accessibilityLabel="Go back" />
      <View style={styles.barCenter}>
        <Text style={type.screenTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.rightSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  largeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: componentHeights.row,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  barCenter: { flex: 1 },
  subtitle: { ...type.meta, marginTop: 1 },
  rightSlot: { minWidth: iconSizes.lg, alignItems: 'flex-end' },
});
