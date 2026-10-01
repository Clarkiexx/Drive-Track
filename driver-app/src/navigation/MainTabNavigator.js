import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeStack from './HomeStack';
import ViolationsStack from './ViolationsStack';
import ChatbotScreen from '../screens/ChatbotScreen';
import colors from '../theme/colors';

const Tab = createBottomTabNavigator();

const ICONS = { Home: '🏠', Violations: '📄', Chat: '💬' };

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{ICONS[route.name]}</Text>,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Violations" component={ViolationsStack} />
      <Tab.Screen name="Chat" component={ChatbotScreen} />
    </Tab.Navigator>
  );
}
