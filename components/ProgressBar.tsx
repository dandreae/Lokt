import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

type Props = {
  progress: number; // 0-1
  color?: string;
  height?: number;
  animated?: boolean;
  // Opt-in richer treatment for screens that want more depth (e.g. Tasks
  // list cards). Off by default so existing call sites (Home, Task Detail)
  // keep their current restrained look.
  gradient?: boolean;
  glow?: boolean;
};

export function ProgressBar({ progress, color = colors.accentPrimary, height = 5, animated = true, gradient = false, glow = false }: Props) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const anim = useRef(new Animated.Value(animated ? 0 : clamped)).current;

  useEffect(() => {
    if (!animated) { anim.setValue(clamped); return; }
    Animated.timing(anim, { toValue: clamped, duration: 700, useNativeDriver: false, easing: Easing.out(Easing.cubic) }).start();
  }, [clamped]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const radius = height / 2;

  return (
    <View style={[styles.track, { height, borderRadius: radius, backgroundColor: colors.progressTrack }]}>
      {/* Shadow lives on this un-clipped wrapper so it isn't cut off. */}
      <Animated.View
        style={[
          { height: '100%', borderRadius: radius, width },
          glow && { shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.75, shadowRadius: height, elevation: 3 },
        ]}
      >
        {/* This layer clips the fill color/gradient to rounded corners. */}
        <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}>
          {gradient ? (
            <LinearGradient
              colors={[color + 'aa', color]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  clip: { overflow: 'hidden' },
});
