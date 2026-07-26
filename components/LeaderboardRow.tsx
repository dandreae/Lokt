import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows, spacing } from '../constants/theme';
import { Avatar } from './Avatar';
import { ProgressBar } from './ProgressBar';

export type LeaderboardEntryData = {
  userId: string;
  name: string;
  value: string;
  rank: number;
  isMe?: boolean;
  isLive?: boolean;
  progress?: number;
  color?: string;
};

const MEDAL_COLORS: Record<number, string> = {
  1: colors.rankGold,
  2: colors.rankSilver,
  3: colors.rankBronze,
};

// The one leaderboard row used by Friends, School, and Group leaderboards.
// Top 3 get a restrained medal glyph; everyone else is plain tabular rank
// text. Rows are meant to sit inside one continuous surface (wrap a list
// of these in a surfaceRaised container with ListDividers).
export function LeaderboardRow({ userId, name, value, rank, isMe, isLive, progress, color }: LeaderboardEntryData) {
  const medal = MEDAL_COLORS[rank];

  return (
    <View style={[styles.row, isMe && styles.rowMe]}>
      <View style={styles.rankCol}>
        {medal ? (
          <Ionicons name="medal" size={22} color={medal} />
        ) : (
          <Text style={styles.rank}>{rank}</Text>
        )}
      </View>

      <Avatar name={name} userId={userId} size={40} isMe={isMe} live={isLive} color={color} />

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>{name}</Text>
          {isLive && <Text style={styles.liveText}>studying now</Text>}
        </View>
        {progress != null && (
          <View style={styles.barWrap}>
            <ProgressBar progress={progress} color={isMe ? colors.accentPrimary : (color ?? colors.textMuted)} height={4} gradient />
          </View>
        )}
      </View>

      <Text style={[styles.value, isMe && styles.valueMe]}>{value}</Text>
    </View>
  );
}

export function LeaderboardHeader({ periodLabel }: { periodLabel: string }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.headerLabel}>Leaderboard</Text>
      <Text style={styles.headerLabel}>{periodLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  rowMe: {
    backgroundColor: colors.accentPrimary + '14',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.accentPrimary,
    marginVertical: 2,
    ...shadows.tinted(colors.accentPrimary),
  },
  rankCol: { width: 26, alignItems: 'center' },
  rank: { fontFamily: 'DMMono-Medium', fontSize: 14, color: colors.textMuted },
  info: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontWeight: '600', fontSize: 15, color: colors.textPrimary, flexShrink: 1 },
  nameMe: { color: colors.accentPrimary },
  liveText: { fontWeight: '500', fontSize: 11, color: colors.accentSecondary },
  barWrap: { width: '100%' },
  value: { fontFamily: 'DMMono-Medium', fontSize: 14, color: colors.textSecondary },
  valueMe: { color: colors.accentPrimary },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  headerLabel: { fontWeight: '600', fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
});
