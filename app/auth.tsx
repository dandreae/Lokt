import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { supabase } from '../utils/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const passwordReqs = [
    { label: 'At least 8 characters',  met: password.length >= 8 },
    { label: 'Uppercase letter',        met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter',        met: /[a-z]/.test(password) },
    { label: 'Number',                  met: /[0-9]/.test(password) },
    { label: 'Special character',       met: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordStrong = passwordReqs.every((r) => r.met);

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setError('');
  }

  function cleanUsername(raw: string): string {
    return raw.toLowerCase().replace(/[^a-z0-9_.]/g, '');
  }

  async function handleSubmit() {
    setError('');

    if (mode === 'signup') {
      if (!username.trim()) { setError('Please choose a username.'); return; }
      if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
      if (!passwordStrong) { setError('Please meet all password requirements.'); return; }
    }

    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: e } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              display_name: username.trim(),
              username: cleanUsername(username),
            },
          },
        });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (e) throw e;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      if (msg.includes('Invalid login credentials')) {
        setError('Incorrect email or password.');
      } else if (msg.includes('already registered')) {
        setError('An account with this email already exists.');
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

          {/* Mode tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => switchMode('login')}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => switchMode('signup')}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.card}>

            {mode === 'signup' && (
              <>
                <View style={styles.inputWrap}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="username"
                    placeholderTextColor={C.text3}
                    value={username}
                    onChangeText={(t) => setUsername(cleanUsername(t))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    editable={!loading}
                  />
                </View>
                <Text style={styles.usernameHint}>
                  This is how friends find you.
                </Text>
              </>
            )}

            {/* Email */}
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={16} color={C.text3} />
              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={C.text3}
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
              <Ionicons name="lock-closed-outline" size={16} color={C.text3} />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={C.text3}
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
                  size={16}
                  color={C.text3}
                />
              </TouchableOpacity>
            </View>

            {mode === 'signup' && password.length > 0 && (
              <View style={styles.passwordReqs}>
                {passwordReqs.map((req) => (
                  <View key={req.label} style={styles.reqRow}>
                    <Ionicons
                      name={req.met ? 'checkmark-circle' : 'ellipse-outline'}
                      size={13}
                      color={req.met ? C.accent2 : C.text3}
                    />
                    <Text style={[styles.reqText, req.met && styles.reqTextMet]}>
                      {req.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {error ? (
              <View style={styles.errorWrap}>
                <Ionicons name="alert-circle-outline" size={14} color={C.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={loading}
              style={styles.submitBtn}
            >
              <View style={styles.submitGradient}>
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitText}>
                    {mode === 'login' ? 'Log In' : 'Create Account'}
                  </Text>
                )}
              </View>
            </TouchableOpacity>

          </View>

          {/* Footer switch */}
          <Text style={styles.footer}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <Text
              style={styles.footerLink}
              onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </Text>
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 40,
  },

  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appName: {
    fontFamily: 'Nunito-Black',
    fontSize: 42,
    color: C.text1,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: 'Nunito-Regular',
    fontSize: 15,
    color: C.text3,
    marginTop: 4,
  },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: C.surface3 },
  tabText: { fontFamily: 'Nunito-SemiBold', fontSize: 14, color: C.text3 },
  tabTextActive: { color: C.text1 },

  card: {
    backgroundColor: C.surface1,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 20,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  input: {
    flex: 1,
    fontFamily: 'Nunito-Regular',
    fontSize: 15,
    color: C.text1,
    padding: 0,
  },
  atSign: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: C.text3,
  },
  usernameHint: {
    fontFamily: 'Nunito-Regular',
    fontSize: 11,
    color: C.text3,
    marginTop: -4,
    paddingHorizontal: 2,
  },

  passwordReqs: {
    gap: 6,
    paddingHorizontal: 2,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  reqText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: C.text3,
  },
  reqTextMet: {
    color: C.accent2,
  },

  errorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.red + '18',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.red + '30',
  },
  errorText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: C.red,
    flex: 1,
  },

  submitBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  submitGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  submitText: {
    fontFamily: 'Nunito-Bold',
    fontSize: 16,
    color: '#fff',
  },

  footer: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: C.text3,
    textAlign: 'center',
  },
  footerLink: {
    fontFamily: 'Nunito-SemiBold',
    color: C.accent,
  },
});
