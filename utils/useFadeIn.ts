import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export function useFadeIn(duration = 300) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    }).start();
  }, []);

  return opacity;
}
