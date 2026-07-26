import { Stack } from 'expo-router';
import { colors } from '../../constants/theme';

export default function GroupsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.backgroundPrimary } }}>
      <Stack.Screen name="new" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
