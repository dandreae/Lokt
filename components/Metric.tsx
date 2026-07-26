import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors, radii, spacing, type } from '../constants/theme';

type Props = {
  value: string;
  label: string;
  valueColor?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
};

// A single stat cell (value + label), with an optional leading icon badge.
// Used in rows via <Metric /> siblings separated by <MetricDivider />.
export function Metric({ value, label, valueColor = colors.textPrimary, icon, iconColor = colors.textSecondary }: Props) {
  return (
    <View style={styles.wrap}>
      {icon && (
        <View style={[styles.iconBadge, { backgroundColor: iconColor + '22' }]}>
          <Ionicons name={icon} size={14} color={iconColor} />
        </View>
      )}
      <Text style={[type.statValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function MetricDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 3 },
  iconBadge: {
    width: 26, height: 26, borderRadius: radii.full,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  label: { fontWeight: '400', fontSize: 10, color: colors.textMuted },
  divider: { width: 1, height: 22, backgroundColor: colors.divider },
});
