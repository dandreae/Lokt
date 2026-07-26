import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ScalePressable } from '../utils/ScalePressable';
import { colors, componentHeights, iconSizes, radii } from '../constants/theme';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  size?: keyof typeof iconSizes;
  color?: string;
  filled?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
};

// Square icon-only button, always at least a 44x44 touch target regardless
// of the visible icon size.
export function IconButton({ icon, onPress, size = 'lg', color = colors.textPrimary, filled = false, disabled, accessibilityLabel }: Props) {
  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.wrap, filled && styles.filled, disabled && styles.disabled]}
    >
      <View accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        <Ionicons name={icon} size={iconSizes[size]} color={color} />
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: componentHeights.touchTarget,
    height: componentHeights.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
  },
  disabled: { opacity: 0.4 },
});
