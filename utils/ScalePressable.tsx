import { useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import type { StyleProp, ViewStyle, PressableProps } from 'react-native';

type Props = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  hitSlop?: PressableProps['hitSlop'];
  children: React.ReactNode;
  disabled?: boolean;
  scaleTo?: number;
};

export function ScalePressable({ onPress, style, children, disabled, scaleTo = 0.96, hitSlop }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start()
      }
      disabled={disabled}
      hitSlop={hitSlop}
      android_ripple={null}
    >
      <Animated.View style={[style as ViewStyle, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
