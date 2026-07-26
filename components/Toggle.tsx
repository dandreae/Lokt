import { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { colors } from '../constants/theme';

type Props = { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };

export function Toggle({ value, onChange, disabled }: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, tension: 70, friction: 11 }).start();
  }, [value]);

  const trackBg = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.surfaceActive, colors.accentPrimary] });
  const thumbX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });

  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.85}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View style={{ width: 42, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: trackBg, opacity: disabled ? 0.5 : 1 }}>
        <Animated.View
          style={{
            position: 'absolute', width: 20, height: 20, borderRadius: 10,
            backgroundColor: '#fff', top: 2, transform: [{ translateX: thumbX }],
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2, elevation: 2,
          }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}
