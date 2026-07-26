import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ScalePressable } from '../utils/ScalePressable';
import { colors, componentHeights, radii, spacing, type } from '../constants/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  color?: string;
  style?: object;
};

export function PrimaryButton({ title, onPress, disabled, loading, compact, color = colors.accentPrimary, style }: Props) {
  const inactive = disabled || loading;
  return (
    <ScalePressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      scaleTo={0.97}
      style={[
        styles.base,
        { height: compact ? componentHeights.buttonCompact : componentHeights.button, backgroundColor: color },
        inactive && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading
          ? <ActivityIndicator color={colors.textOnAccent} size="small" />
          : <Text style={compact ? type.buttonCompact : type.button}>{title}</Text>
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
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disabled: { opacity: 0.4 },
});
