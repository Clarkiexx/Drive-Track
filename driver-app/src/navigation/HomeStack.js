import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import ViolationStatusScreen from '../screens/ViolationStatusScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ViolationDetailScreen from '../screens/ViolationDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LearningCenterScreen from '../screens/LearningCenterScreen';
import QuizScreen from '../screens/QuizScreen';

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="ViolationStatus" component={ViolationStatusScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ViolationDetail" component={ViolationDetailScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="LearningCenter" component={LearningCenterScreen} />
      <Stack.Screen name="Quiz" component={QuizScreen} />
    </Stack.Navigator>
  );
}
