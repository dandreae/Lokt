import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../constants/theme';

type Props = {
  size?: number;
  strokeWidth?: number;
  progress?: number; // 0-1
  color?: string;
  trackAlpha?: string; // hex alpha suffix appended to color for the track, e.g. '22'
  // Opt-in diagonal gradient stroke (e.g. Timer/Stopwatch's blue-to-green
  // ring). Falls back to the solid `color` prop everywhere else (Home).
  gradientColors?: [string, string];
  children?: React.ReactNode;
};

let ringInstanceCount = 0;

// The single ring implementation used everywhere a circular progress
// indicator appears: Timer, Stopwatch, and the Home weekly-goal ring.
export function CircularStudyTimer({
  size = 220,
  strokeWidth = 8,
  progress = 0,
  color = colors.accentPrimary,
  trackAlpha = '20',
  gradientColors,
  children,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gradientId = useRef(`ringGradient${ringInstanceCount++}`).current;

  const [offset, setOffset] = useState(circumference);
  const arcAnim = useRef(new Animated.Value(circumference)).current;

  useEffect(() => {
    const target = circumference * (1 - Math.min(Math.max(progress, 0), 1));
    const id = arcAnim.addListener(({ value }) => setOffset(value));
    Animated.timing(arcAnim, {
      toValue: target,
      duration: 800,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start(() => arcAnim.removeListener(id));
    return () => arcAnim.removeListener(id);
  }, [progress, circumference]);

  const strokeColor = gradientColors ? `url(#${gradientId})` : color;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {gradientColors && (
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={gradientColors[0]} />
              <Stop offset="100%" stopColor={gradientColors[1]} />
            </LinearGradient>
          </Defs>
        )}
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color + trackAlpha} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={strokeColor} strokeWidth={strokeWidth} fill="none"
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
