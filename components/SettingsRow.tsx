import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ScalePressable } from '../utils/ScalePressable';
import { colors, componentHeights, iconSizes, radii, spacing, type } from '../constants/theme';
import { ListDivider } from './ListDivider';

type RowProps = {
  label: string;
  helper?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  navigable?: boolean;
};

export function SettingsRow({ label, helper, icon, right, onPress, destructive, navigable }: RowProps) {
  const labelColor = destructive ? colors.destructive : colors.textPrimary;
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={iconSizes.md} color={destructive ? colors.destructive : colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.textCol}>
        <Text style={[type.settingsLabel, { color: labelColor }]}>{label}</Text>
        {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      </View>
      {right}
      {navigable && !right ? <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.textMuted} /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <ScalePressable onPress={onPress} scaleTo={0.99}>
      {content}
    </ScalePressable>
  );
}

// Groups SettingsRow children under an uppercase section label, on one
// continuous surface with dividers between rows (never a card per row).
export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>
        {items.filter(Boolean).map((child, i) => (
          <Fragment key={i}>
            {i > 0 && <ListDivider inset={spacing.lg + iconSizes.md + spacing.md} />}
            {child}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xxl },
  sectionTitle: { ...type.sectionTitle, marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: componentHeights.row,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  iconWrap: { width: iconSizes.md, alignItems: 'center' },
  textCol: { flex: 1 },
  helper: { ...type.meta, marginTop: 2 },
});
