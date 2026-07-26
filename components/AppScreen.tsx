import { Animated, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../constants/theme';
import { useFadeIn } from '../utils/useFadeIn';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  fade?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
};

// Shared screen shell: safe-area + standard horizontal padding + optional
// scroll + optional mount fade. Every primary/detail/modal screen sits on
// this so padding and background are never redeclared per-screen.
export function AppScreen({
  children,
  scroll = true,
  fade = true,
  edges = ['top'],
  contentStyle,
  keyboardShouldPersistTaps = 'handled',
}: Props) {
  const fadeAnim = useFadeIn();
  const opacity = fade ? fadeAnim : 1;

  const inner = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <SafeAreaView style={styles.safe} edges={edges}>
        {inner}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundPrimary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.section + spacing.lg },
});
