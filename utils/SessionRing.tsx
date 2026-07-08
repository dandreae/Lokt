import { useState, useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C } from '../constants/colors';

type Props = {
  size?: number;
  strokeWidth?: number;
  progress?: number;
  running?: boolean;
  color?: string;
  children?: React.ReactNode;
};

export function SessionRing({
  size = 220,
  strokeWidth = 6,
  progress = 0,
  color = C.accent,
  children,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const [offset, setOffset] = useState(circumference);
  const arcAnim = useRef(new Animated.Value(circumference)).current;

  useEffect(() => {
    const target = circumference * (1 - Math.min(Math.max(progress, 0), 1));
    const id = arcAnim.addListener(({ value }) => setOffset(value));
    Animated.timing(arcAnim, {
      toValue: target,
      duration: 900,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start(() => arcAnim.removeListener(id));
    return () => arcAnim.removeListener(id);
  }, [progress, circumference]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color + '22'}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
