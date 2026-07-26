import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, iconSizes, componentHeights, type } from '../constants/theme';
import { PrimaryButton } from '../components/PrimaryButton';
import { supabase } from '../utils/supabase';

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordRef = useRef<TextInput>(null);

  async function handleSubmit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (e) throw e;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      if (msg.includes('Invalid login credentials')) {
        setError('Incorrect email or password.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.appName}>Lokt</Text>
            <Text style={styles.tagline}>Study with your people.</Text>
          </View>

          {/* Form */}
          <View style={styles.card}>

            {/* Email */}
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={iconSizes.sm} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!loading}
              />
            </View>

            {/* Password */}
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={iconSizes.sm} color={colors.textMuted} />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={iconSizes.sm}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorWrap}>
                <Ionicons name="alert-circle-outline" size={iconSizes.sm} color={colors.destructive} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <PrimaryButton
              title="Log In"
              onPress={handleSubmit}
              loading={loading}
              style={styles.submitBtn}
            />

          </View>

          {/* Footer switch */}
          <Text style={styles.footer}>
            Don't have an account?{' '}
            <Text style={styles.footerLink} onPress={() => router.push('/onboarding')}>
              Sign up
            </Text>
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundPrimary },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
    paddingBottom: spacing.section,
  },

  header: {
    alignItems: 'center',
    marginBottom: spacing.section,
  },
  appName: {
    fontWeight: '700',
    fontSize: 42,
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  tagline: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.md,
    height: componentHeights.input,
  },
  input: {
    flex: 1,
    ...type.body,
    padding: 0,
  },

  errorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.destructive + '18',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.destructive + '30',
  },
  errorText: {
    ...type.meta,
    color: colors.destructive,
    flex: 1,
  },

  submitBtn: {
    marginTop: spacing.xs,
  },

  footer: {
    ...type.meta,
    textAlign: 'center',
  },
  footerLink: {
    fontWeight: '500',
    color: colors.accentPrimary,
  },
});
