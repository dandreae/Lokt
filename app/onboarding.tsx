import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, iconSizes, componentHeights, fonts, type } from '../constants/theme';
import { PrimaryButton } from '../components/PrimaryButton';
import { IconButton } from '../components/IconButton';
import { ProgressDots } from '../components/ProgressDots';
import { Avatar } from '../components/Avatar';
import { AVATAR_COLORS } from '../utils/avatar';
import { supabase } from '../utils/supabase';
import {
  updateDisplayName,
  updateUsername,
  updateAvatarColor,
  updatePhone,
  isUsernameAvailable,
} from '../store/social';
import { setOnboardingComplete } from '../store/onboarding';

type Phase = 'welcome' | 'account' | 'verify' | 'profile' | 'password';
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const STEP_INDEX: Record<Exclude<Phase, 'welcome'>, number> = { account: 0, verify: 1, profile: 2, password: 3 };

function cleanUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_.]/g, '');
}

function passwordReqsFor(pw: string) {
  return [
    { label: 'At least 8 characters', met: pw.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(pw) },
    { label: 'Lowercase letter', met: /[a-z]/.test(pw) },
    { label: 'Number', met: /[0-9]/.test(pw) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('welcome');

  // If we land here with an already-active session (e.g. the app was
  // force-quit mid-flow, after verification but before finishing up),
  // skip straight to Profile instead of restarting signup.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPhase('profile');
    });
  }, []);

  // Account (no password here — that's collected after username, below)
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');

  // Verify
  const [otp, setOtp] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [resending, setResending] = useState(false);

  // Profile
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password (final step)
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const passwordReqs = passwordReqsFor(password);
  const passwordStrong = passwordReqs.every((r) => r.met);

  // Debounced live username availability check
  useEffect(() => {
    const clean = cleanUsername(username);
    if (clean.length === 0) { setUsernameStatus('idle'); return; }
    if (clean.length < 3) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      const available = await isUsernameAvailable(clean);
      setUsernameStatus(available ? 'available' : 'taken');
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  async function handleSendCode() {
    setAccountError('');
    if (!email.trim()) { setAccountError('Please enter your email.'); return; }

    setAccountLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setPhase('verify');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      setAccountError(msg);
    } finally {
      setAccountLoading(false);
    }
  }

  async function handleVerify() {
    setVerifyError('');
    setVerifyLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      });
      if (error) throw error;
      setPhase('profile');
    } catch {
      setVerifyError('Invalid or expired code.');
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setVerifyError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setResending(false);
    if (error) setVerifyError(error.message);
  }

  async function handleFinishProfile() {
    setProfileError('');
    if (!displayName.trim()) { setProfileError('Please enter your name.'); return; }
    if (usernameStatus !== 'available') { setProfileError('Please choose an available username.'); return; }

    setProfileLoading(true);
    const [nameRes, userRes] = await Promise.all([
      updateDisplayName(displayName),
      updateUsername(username),
      updateAvatarColor(avatarColor),
      phone.trim() ? updatePhone(phone) : Promise.resolve({ success: true, message: '' }),
    ]);
    setProfileLoading(false);

    if (!nameRes.success) { setProfileError(nameRes.message); return; }
    if (!userRes.success) { setProfileError(userRes.message); return; }

    setPhase('password');
  }

  async function handleSetPassword() {
    setPasswordError('');
    if (!passwordStrong) { setPasswordError('Please meet all password requirements.'); return; }
    if (password !== confirmPassword) { setPasswordError('Passwords don\'t match.'); return; }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await setOnboardingComplete();
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setPasswordLoading(false);
    }
  }

  const step = phase === 'welcome' ? -1 : STEP_INDEX[phase];
  const canGoBack = phase === 'account' || phase === 'verify';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {step >= 0 && (
            <View style={styles.topBar}>
              {canGoBack ? (
                <IconButton
                  icon="chevron-back"
                  onPress={() => setPhase(phase === 'account' ? 'welcome' : 'account')}
                  size="sm"
                  color={colors.textSecondary}
                  accessibilityLabel="Back"
                />
              ) : <View style={{ width: componentHeights.touchTarget }} />}
              <ProgressDots total={4} current={step} />
              <View style={{ width: componentHeights.touchTarget }} />
            </View>
          )}

          {/* ── Welcome ─────────────────────────────────────────── */}
          {phase === 'welcome' && (
            <View style={styles.welcomeWrap}>
              <Text style={styles.mark}>Lokt</Text>
              <Text style={styles.tagline}>Study with your people.</Text>

              <View style={styles.welcomeActions}>
                <PrimaryButton title="Create Account" onPress={() => setPhase('account')} />
                <TouchableOpacity onPress={() => router.push('/auth')} activeOpacity={0.7} style={styles.loginLink}>
                  <Text style={styles.footer}>
                    Already have an account? <Text style={styles.footerLink}>Log in</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Account ─────────────────────────────────────────── */}
          {phase === 'account' && (
            <View style={styles.stepWrap}>
              <Text style={styles.stepTitle}>What's your email?</Text>
              <Text style={styles.stepSub}>We'll send you a code to verify it.</Text>

              <View style={styles.card}>
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
                    editable={!accountLoading}
                    autoFocus
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Ionicons name="call-outline" size={iconSizes.sm} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Phone (optional)"
                    placeholderTextColor={colors.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    editable={!accountLoading}
                  />
                </View>

                {accountError ? (
                  <View style={styles.errorWrap}>
                    <Ionicons name="alert-circle-outline" size={iconSizes.sm} color={colors.destructive} />
                    <Text style={styles.errorText}>{accountError}</Text>
                  </View>
                ) : null}

                <PrimaryButton title="Send Code" onPress={handleSendCode} loading={accountLoading} />
              </View>
            </View>
          )}

          {/* ── Verify email ────────────────────────────────────── */}
          {phase === 'verify' && (
            <View style={styles.stepWrap}>
              <Text style={styles.stepTitle}>Check your email</Text>
              <Text style={styles.stepSub}>We sent a 6-digit code to {email.trim()}.</Text>

              <View style={styles.card}>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="000000"
                  placeholderTextColor={colors.textMuted}
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />

                {verifyError ? (
                  <View style={styles.errorWrap}>
                    <Ionicons name="alert-circle-outline" size={iconSizes.sm} color={colors.destructive} />
                    <Text style={styles.errorText}>{verifyError}</Text>
                  </View>
                ) : null}

                <PrimaryButton
                  title="Verify & Continue"
                  onPress={handleVerify}
                  disabled={otp.length < 6}
                  loading={verifyLoading}
                />

                <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resendBtn} activeOpacity={0.7}>
                  {resending
                    ? <ActivityIndicator color={colors.textMuted} size="small" />
                    : <Text style={styles.footerLink}>Resend code</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Profile ─────────────────────────────────────────── */}
          {phase === 'profile' && (
            <View style={styles.stepWrap}>
              <Text style={styles.stepTitle}>Set up your profile</Text>
              <Text style={styles.stepSub}>This is how you'll show up to friends.</Text>

              <View style={styles.avatarPreviewWrap}>
                <Avatar name={displayName || '?'} userId="preview" size={88} color={avatarColor} />
              </View>

              <View style={styles.swatchRow}>
                {AVATAR_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setAvatarColor(c)}
                    style={[styles.swatch, { backgroundColor: c }, c === avatarColor && styles.swatchSelected]}
                    activeOpacity={0.8}
                  />
                ))}
              </View>

              <View style={styles.card}>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={iconSizes.sm} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Your name"
                    placeholderTextColor={colors.textMuted}
                    value={displayName}
                    onChangeText={setDisplayName}
                    editable={!profileLoading}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="username"
                    placeholderTextColor={colors.textMuted}
                    value={username}
                    onChangeText={(t) => setUsername(cleanUsername(t))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!profileLoading}
                  />
                  {usernameStatus === 'checking' && <ActivityIndicator size="small" color={colors.textMuted} />}
                  {usernameStatus === 'available' && <Ionicons name="checkmark-circle" size={iconSizes.sm} color={colors.accentSecondary} />}
                  {usernameStatus === 'taken' && <Ionicons name="close-circle" size={iconSizes.sm} color={colors.destructive} />}
                </View>
                {usernameStatus === 'taken' && <Text style={styles.usernameHint}>That username is taken.</Text>}
                {usernameStatus === 'invalid' && <Text style={styles.usernameHint}>At least 3 characters.</Text>}
                {usernameStatus === 'available' && <Text style={[styles.usernameHint, { color: colors.accentSecondary }]}>Available!</Text>}

                {profileError ? (
                  <View style={styles.errorWrap}>
                    <Ionicons name="alert-circle-outline" size={iconSizes.sm} color={colors.destructive} />
                    <Text style={styles.errorText}>{profileError}</Text>
                  </View>
                ) : null}

                <PrimaryButton
                  title="Continue"
                  onPress={handleFinishProfile}
                  disabled={!displayName.trim() || usernameStatus !== 'available'}
                  loading={profileLoading}
                />
              </View>
            </View>
          )}

          {/* ── Password (final step) ────────────────────────────── */}
          {phase === 'password' && (
            <View style={styles.stepWrap}>
              <Text style={styles.stepTitle}>Secure your account</Text>
              <Text style={styles.stepSub}>Create a password so you can log back in.</Text>

              <View style={styles.card}>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={iconSizes.sm} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    editable={!passwordLoading}
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={iconSizes.sm} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={iconSizes.sm} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    editable={!passwordLoading}
                    onSubmitEditing={handleSetPassword}
                  />
                </View>

                {password.length > 0 && (
                  <View style={styles.passwordReqs}>
                    {passwordReqs.map((req) => (
                      <View key={req.label} style={styles.reqRow}>
                        <Ionicons
                          name={req.met ? 'checkmark-circle' : 'ellipse-outline'}
                          size={iconSizes.sm}
                          color={req.met ? colors.accentSecondary : colors.textMuted}
                        />
                        <Text style={[styles.reqText, req.met && styles.reqTextMet]}>{req.label}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {passwordError ? (
                  <View style={styles.errorWrap}>
                    <Ionicons name="alert-circle-outline" size={iconSizes.sm} color={colors.destructive} />
                    <Text style={styles.errorText}>{passwordError}</Text>
                  </View>
                ) : null}

                <PrimaryButton
                  title="Finish"
                  onPress={handleSetPassword}
                  disabled={!passwordStrong || !confirmPassword}
                  loading={passwordLoading}
                />
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundPrimary },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl, paddingBottom: spacing.section },

  topBar: {
    position: 'absolute', top: spacing.md, left: spacing.lg, right: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },

  welcomeWrap: { alignItems: 'center' },
  mark: {
    fontFamily: fonts.display,
    fontSize: 56,
    color: colors.textPrimary,
    textAlign: 'center',
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
  },
  tagline: { ...type.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.section },
  welcomeActions: { width: '100%', gap: spacing.lg, alignItems: 'center' },
  loginLink: { paddingVertical: spacing.sm },

  stepWrap: { width: '100%' },
  stepTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary, textAlign: 'center' },
  stepSub: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xxl },

  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
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
  input: { flex: 1, ...type.body, padding: 0 },
  atSign: { fontWeight: '500', fontSize: 15, color: colors.textMuted },
  otpInput: { textAlign: 'center', fontFamily: 'DMMono-Medium', fontSize: 22, letterSpacing: 8 },
  usernameHint: { ...type.helper, marginTop: -spacing.xs, paddingHorizontal: spacing.xs },

  passwordReqs: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reqText: { ...type.meta },
  reqTextMet: { color: colors.accentSecondary },

  errorWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.destructive + '18', borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.destructive + '30',
  },
  errorText: { ...type.meta, color: colors.destructive, flex: 1 },

  resendBtn: { alignSelf: 'center', paddingVertical: spacing.xs },

  avatarPreviewWrap: { alignItems: 'center', marginBottom: spacing.lg },
  swatchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl, flexWrap: 'wrap' },
  swatch: { width: 32, height: 32, borderRadius: radii.full, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: colors.textPrimary },

  footer: { ...type.meta, textAlign: 'center' },
  footerLink: { fontWeight: '600', color: colors.accentPrimary },
});
