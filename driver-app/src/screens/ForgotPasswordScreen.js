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
import client from '../api/client';
import colors from '../theme/colors';

export default function ForgotPasswordScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setErrorMessage('');
    setResultMessage('');

    if (!fullName.trim() || !licenseNumber.trim()) {
      setErrorMessage('Please enter both your full name and license number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await client.post('/auth/driver/forgot-password', {
        fullName: fullName.trim(),
        licenseNumber: licenseNumber.trim(),
      });
      setResultMessage(response.data.message);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>
            Enter your full name and license number exactly as they appear on your account. Your
            password will be reset back to your license number.
          </Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Juan Dela Cruz"
            placeholderTextColor={colors.placeholder}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>License Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., N01-12-345678"
            placeholderTextColor={colors.placeholder}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            autoCapitalize="characters"
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {resultMessage ? <Text style={styles.successText}>{resultMessage}</Text> : null}

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Reset Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 16 }}>
            <Text style={styles.backLink}>← Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.background },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 8, marginBottom: 20, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 14 },
  successText: { color: colors.primary, fontSize: 13, marginTop: 14, lineHeight: 18 },
  submitButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  backLink: { color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
