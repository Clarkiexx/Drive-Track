import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MyViolationsScreen from '../screens/MyViolationsScreen';
import ViolationDetailScreen from '../screens/ViolationDetailScreen';

const Stack = createNativeStackNavigator();

export default function ViolationsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyViolationsMain" component={MyViolationsScreen} />
      <Stack.Screen name="ViolationDetail" component={ViolationDetailScreen} />
    </Stack.Navigator>
  );
}
