import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

type Props = {
  total: number;
  current: number; // 0-indexed
};

// Small step indicator for multi-step flows (onboarding, wizards). Not a
// carousel page indicator — steps are sequential and non-skippable.
export function ProgressDots({ total, current }: Props) {
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current + 1 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current && styles.dotActive,
            i < current && styles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.divider },
  dotDone: { backgroundColor: colors.accentPrimary + '80' },
  dotActive: { backgroundColor: colors.accentPrimary, width: 18 },
});
