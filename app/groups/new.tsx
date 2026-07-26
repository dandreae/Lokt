import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, radii, componentHeights, type } from '../../constants/theme';
import { AppHeader } from '../../components/AppHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { createGroup } from '../../store/groups';

export default function NewGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 60;

  async function handleCreate() {
    if (!valid || loading) return;
    setLoading(true);
    const r = await createGroup(trimmed);
    setLoading(false);
    if (r.success && r.groupId) {
      router.replace(`/groups/${r.groupId}` as any);
    } else {
      Alert.alert('Could not create group', r.message);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AppHeader variant="bar" title="New Group" onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.form}>
          <Text style={type.sectionTitle}>Group name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. CS study squad"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            maxLength={60}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <Text style={styles.hint}>{60 - trimmed.length} characters remaining</Text>

          <PrimaryButton
            title="Create Group"
            onPress={handleCreate}
            disabled={!valid}
            loading={loading}
            style={styles.createBtn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundPrimary },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.section },
  form: { width: '100%', maxWidth: 440, gap: spacing.md },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    minHeight: componentHeights.input,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  hint: { ...type.helper, textAlign: 'right' },
  createBtn: { marginTop: spacing.sm },
});
