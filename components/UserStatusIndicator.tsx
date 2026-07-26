import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { colors } from '../constants/theme';

type Props = { live: boolean; size?: number; color?: string };

// Quiet pulsing dot used to show "studying now" without a loud LIVE badge.
export function UserStatusIndicator({ live, size = 8, color = colors.accentSecondary }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [live]);

  if (!live) return null;

  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity: pulse,
        borderWidth: 1.5, borderColor: colors.backgroundPrimary,
      }}
    />
  );
}
