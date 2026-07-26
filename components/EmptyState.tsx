import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors, iconSizes, spacing, type } from '../constants/theme';

type Props = {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <View style={styles.wrap}>
      {icon ? <Ionicons name={icon} size={iconSizes.xl} color={colors.textMuted} style={styles.icon} /> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.section, gap: spacing.xs },
  icon: { marginBottom: spacing.sm },
  title: { fontWeight: '600', fontSize: 15, color: colors.textSecondary },
  subtitle: { ...type.meta, textAlign: 'center', maxWidth: 260 },
  action: { marginTop: spacing.md },
});
