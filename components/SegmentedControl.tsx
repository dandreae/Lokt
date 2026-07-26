import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing } from '../constants/theme';

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  // Opt-in gradient fill for the active segment (e.g. Timer's Stopwatch/
  // Timer toggle). Omit for the neutral default used everywhere else
  // (Friends/School/Groups, Auth, Group period picker).
  gradientColors?: [string, string];
};

// One segmented-control visual language for the whole app: Friends/School/
// Groups, Auth login/signup, Timer stopwatch/timer, Group period picker.
export function SegmentedControl<T extends string>({ options, value, onChange, disabled, gradientColors }: Props<T>) {
  return (
    <View style={[styles.track, disabled && styles.trackDisabled]} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segment, active && !gradientColors && styles.segmentActive]}
            onPress={() => {
              if (!active && !disabled) { Haptics.selectionAsync(); onChange(opt.value); }
            }}
            activeOpacity={0.75}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
          >
            {active && gradientColors && (
              <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.content}>
              {opt.icon && <Ionicons name={opt.icon} size={15} color={active ? colors.textOnAccent : colors.textMuted} />}
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {opt.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  trackDisabled: { opacity: 0.5 },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  segmentActive: { backgroundColor: colors.surfaceActive },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { fontWeight: '500', fontSize: 13, color: colors.textMuted },
  labelActive: { fontWeight: '700', color: colors.textOnAccent },
});
