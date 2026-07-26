import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ScalePressable } from '../utils/ScalePressable';
import { colors, componentHeights, radii, spacing } from '../constants/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  destructive?: boolean;
  style?: object;
};

export function SecondaryButton({ title, onPress, disabled, loading, compact, destructive, style }: Props) {
  const inactive = disabled || loading;
  const textColor = destructive ? colors.destructive : colors.textPrimary;
  return (
    <ScalePressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      scaleTo={0.97}
      style={[
        styles.base,
        { height: compact ? componentHeights.buttonCompact : componentHeights.button },
        destructive && styles.destructiveBorder,
        inactive && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading
          ? <ActivityIndicator color={textColor} size="small" />
          : <Text style={[styles.text, { color: textColor }]}>{title}</Text>
        }
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  destructiveBorder: { borderColor: colors.destructive + '60' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.4 },
});
