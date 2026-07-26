import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes, spacing, type } from '../constants/theme';
import { SecondaryButton } from './SecondaryButton';

type Props = {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
};

export function ErrorState({ title = 'Something went wrong', subtitle, onRetry }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="alert-circle-outline" size={iconSizes.xl} color={colors.destructive} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={type.meta}>{subtitle}</Text> : null}
      {onRetry ? <View style={styles.action}><SecondaryButton title="Try Again" onPress={onRetry} compact /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.section, gap: spacing.xs },
  icon: { marginBottom: spacing.sm },
  title: { fontWeight: '600', fontSize: 15, color: colors.textSecondary },
  action: { marginTop: spacing.md },
});
