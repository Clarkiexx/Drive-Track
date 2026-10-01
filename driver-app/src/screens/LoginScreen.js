import React, { useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { loginDriver } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { API_URL, API_URL_PROBLEM } from '../config';
import colors from '../theme/colors';

/** Distinguishes "server rejected credentials" from "server unreachable". */
function getLoginErrorMessage(err) {
  if (err.response?.data?.message) return err.response.data.message;
  if (err.request && !err.response) {
    const hint = API_URL_PROBLEM ? ` URL problem: ${API_URL_PROBLEM}` : '';
    return (
      `Cannot reach the server at ${API_URL}.${hint} ` +
      'Make sure the backend is running (npm run dev), the phone/emulator is on the same Wi-Fi, ' +
      'and EXPO_PUBLIC_API_URL is set to your computer\'s LAN IP (not localhost).'
    );
  }
  return 'Unable to log in. Please check your connection and try again.';
}

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin() {
    setErrorMessage('');

    if (!fullName.trim() || !password.trim()) {
      setErrorMessage('Please enter both your full name and license number/password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await loginDriver({ fullName: fullName.trim(), password: password.trim() });
      const { token, driver, mustChangePassword } = response.data.data;
      await signIn({ token, driver, mustChangePassword });
      // Navigation onward happens automatically — App.js watches auth state
      // and switches stacks once signIn() completes.
    } catch (err) {
      setErrorMessage(getLoginErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.header}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconGlyph}>🚗</Text>
          </View>
          <Text style={styles.title}>DriveTrack</Text>
          <Text style={styles.subtitle}>Driver Portal</Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome</Text>
          <Text style={styles.welcomeSubtext}>Sign in to view your violations</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Juan Dela Cruz"
            placeholderTextColor={colors.placeholder}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoCorrect={false}
          />

          <Text style={styles.label}>License Number</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="e.g., N01-12-345678"
              placeholderTextColor={colors.placeholder}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="characters"
              autoCorrect={false}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.eyeGlyph}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity
            style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Register</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.registerLink}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 64,
    paddingBottom: 40,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconGlyph: {
    fontSize: 26,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#E8F0E9',
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 20,
    marginTop: -24,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  welcome: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingRight: 6,
  },
  eyeButton: { paddingHorizontal: 10, paddingVertical: 10 },
  eyeGlyph: { fontSize: 18 },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 12,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 22,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left',
    marginTop: 16,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
