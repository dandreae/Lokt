import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, componentHeights, iconSizes, type } from '../../constants/theme';

type TabIconProps = {
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
};

function TabIcon({ focused, name }: TabIconProps) {
  return <Ionicons name={name} size={iconSizes.lg} color={focused ? colors.accentPrimary : colors.textMuted} />;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.backgroundSecondary,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          height: componentHeights.tabBar + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 8,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: type.navLabel,
        tabBarActiveTintColor: colors.accentPrimary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={focused ? 'home' : 'home-outline'} />,
        }}
      />
      <Tabs.Screen
        name="subjects"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={focused ? 'book' : 'book-outline'} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={focused ? 'people' : 'people-outline'} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name={focused ? 'person' : 'person-outline'} />,
        }}
      />
    </Tabs>
  );
}
