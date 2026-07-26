import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';
import { getAvatarColor, getInitials } from '../utils/avatar';
import { UserStatusIndicator } from './UserStatusIndicator';

type Props = {
  name: string;
  userId: string;
  size?: number;
  isMe?: boolean;
  live?: boolean;
  color?: string;
};

export function Avatar({ name, userId, size = 40, isMe, live, color }: Props) {
  const tint = color ?? (isMe ? colors.accentPrimary : getAvatarColor(userId));
  const initials = isMe ? 'ME' : getInitials(name);
  const fontSize = Math.round(size * 0.32);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: tint + '33' },
        ]}
      >
        <Text style={{ color: tint, fontWeight: '600', fontSize }}>{initials}</Text>
      </View>
      {live ? (
        <View style={styles.statusWrap}>
          <UserStatusIndicator live size={9} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  statusWrap: { position: 'absolute', bottom: -1, right: -1 },
});
