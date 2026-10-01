import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import DriverSearchScreen from './src/screens/DriverSearchScreen';
import IssueCitationScreen from './src/screens/IssueCitationScreen';
import CitationSuccessScreen from './src/screens/CitationSuccessScreen';
import PreviousCitationsScreen from './src/screens/PreviousCitationsScreen';
import DriverRecordScreen from './src/screens/DriverRecordScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import colors from './src/theme/colors';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!token ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="DriverSearch" component={DriverSearchScreen} />
          <Stack.Screen name="IssueCitation" component={IssueCitationScreen} />
          <Stack.Screen name="CitationSuccess" component={CitationSuccessScreen} />
          <Stack.Screen name="PreviousCitations" component={PreviousCitationsScreen} />
          <Stack.Screen name="DriverRecord" component={DriverRecordScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
