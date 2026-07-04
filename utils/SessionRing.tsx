import { useState, useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C } from '../constants/colors';

type Props = {
  size?: number;
  strokeWidth?: number;
  progress?: number;   // 0–1
  running?: boolean;
  color?: string;
  children?: React.ReactNode;
};

export function SessionRing({
  size = 220,
  strokeWidth = 8,
  progress = 0,
  running = false,
  color = C.accent,
  children,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Smooth arc — driven by a JS-side listener so SVG gets plain numbers
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

  // Soft inner glow that breathes when running
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) {
      Animated.timing(glowOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.13,
          duration: 2600,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.04,
          duration: 2600,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [running]);

  const glowSize = size * 0.72;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Atmospheric inner glow — breathes with the session */}
      <Animated.View
        style={{
          position: 'absolute',
          width: glowSize,
          height: glowSize,
          borderRadius: glowSize / 2,
          backgroundColor: color,
          opacity: glowOpacity,
        }}
      />

      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Broad soft halo behind the arc */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color + '14'}
          strokeWidth={strokeWidth + 8}
          fill="none"
        />
        {/* Thin track */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Live progress arc */}
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
