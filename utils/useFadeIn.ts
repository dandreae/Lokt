import { useRef } from 'react';
import { Animated } from 'react-native';

export function useFadeIn(_duration?: number) {
  return useRef(new Animated.Value(1)).current;
}
