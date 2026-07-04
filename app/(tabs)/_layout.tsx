import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../constants/colors';

type TabIconProps = {
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
};

function TabIcon({ focused, name }: TabIconProps) {
  return (
    <Ionicons
      name={name}
      size={24}
      color={focused ? C.accent : C.text3}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.surface1,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.text3,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'home' : 'home-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="subjects"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'book' : 'book-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'people' : 'people-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'person' : 'person-outline'} />
          ),
        }}
      />
    </Tabs>
  );
}
