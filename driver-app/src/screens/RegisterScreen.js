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
  Alert,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { registerDriver } from '../api/authApi';
import { API_URL, API_URL_PROBLEM } from '../config';
import colors from '../theme/colors';

/** Surfaces server validation details; explains unreachable-server separately. */
function getRegisterErrorMessage(err) {
  const data = err.response?.data;
  if (data?.message && data?.message !== 'Validation failed') return data.message;
  if (data?.message === 'Validation failed' && Array.isArray(data?.errors)) {
    const details = data.errors.map((e) => e.msg || e.message).filter(Boolean).join(' ');
    return details || data.message;
  }
  if (err.request && !err.response) {
    const hint = API_URL_PROBLEM ? ` URL problem: ${API_URL_PROBLEM}` : '';
    return (
      `Cannot reach the server at ${API_URL}.${hint} ` +
      'Make sure the backend is running (npm run dev), the phone/emulator is on the same Wi-Fi, ' +
      'and EXPO_PUBLIC_API_URL is set to your computer\'s LAN IP (not localhost).'
    );
  }
  return 'Unable to register. Please check your connection and try again.';
}

export default function RegisterScreen({ navigation }) {
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [licensePhoto, setLicensePhoto] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function pickLicensePhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access so you can attach your license photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setLicensePhoto(result.assets[0].uri);
    }
  }

  async function handleSignUp() {
    setErrorMessage('');

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('First name and last name are required.');
      return;
    }
    if (!licenseNumber.trim()) {
      setErrorMessage('License number is required — it doubles as your temporary password.');
      return;
    }
    if (!licensePhoto) {
      setErrorMessage('Please attach a photo of your driver’s license — the admin uses this to verify your account.');
      return;
    }

    setIsSubmitting(true);
    try {
      await registerDriver({
        firstName: firstName.trim(),
        middleInitial: middleInitial.trim() || undefined,
        lastName: lastName.trim(),
        licenseNumber: licenseNumber.trim(),
        contactNumber: contactNumber.trim() || undefined,
        address: address.trim() || undefined,
      }, licensePhoto);

      Alert.alert(
        'Account created',
        'Your account is Pending review. You can log in, but full access unlocks once the admin verifies your license photo.',
        [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err) {
      setErrorMessage(getRegisterErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <Text style={styles.iconGlyph}>🛡️</Text>
          </View>
          <Text style={styles.title}>Drive Track</Text>
          <Text style={styles.subtitle}>Driver History Tracking System</Text>

          <Text style={styles.sectionTitle}>Create your account</Text>
          <Text style={styles.sectionSubtitle}>Sign up as a registered driver.</Text>

          <View style={styles.row}>
            <View style={styles.rowItemLarge}>
              <Text style={styles.label}>
                First Name<Text style={styles.required}> *</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Juan"
                placeholderTextColor={colors.placeholder}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.rowItemSmall}>
              <Text style={styles.label}>M.I.</Text>
              <TextInput
                style={styles.input}
                placeholder="A"
                placeholderTextColor={colors.placeholder}
                value={middleInitial}
                onChangeText={setMiddleInitial}
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
          </View>

          <Text style={styles.label}>
            Last Name<Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Dela Cruz"
            placeholderTextColor={colors.placeholder}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>License Number</Text>
          <TextInput
            style={styles.input}
            placeholder="N01-23-456789"
            placeholderTextColor={colors.placeholder}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={styles.label}>Contact Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+63 912 345 6789"
            placeholderTextColor={colors.placeholder}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Purok Kokomama, Pilipog, Cordova, Cebu 6017"
            placeholderTextColor={colors.placeholder}
            value={address}
            onChangeText={setAddress}
          />

          <Text style={styles.label}>Driver’s License Photo<Text style={styles.required}> *</Text></Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: 8 }}>
            The admin reviews this photo before verifying your account.
          </Text>
          {licensePhoto ? (
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Image source={{ uri: licensePhoto }} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 8 }} resizeMode="cover" />
              <TouchableOpacity onPress={pickLicensePhoto}>
                <Text style={styles.backLinkText}>Retake / Choose different photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoButton} onPress={pickLicensePhoto}>
              <Text style={styles.photoButtonText}>📷 Attach license photo</Text>
            </TouchableOpacity>
          )}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity
            style={[styles.signUpButton, isSubmitting && styles.signUpButtonDisabled]}
            onPress={handleSignUp}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signUpButtonText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconGlyph: {
    fontSize: 26,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    alignSelf: 'flex-start',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  rowItemLarge: {
    flex: 2,
  },
  rowItemSmall: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
    marginTop: 12,
    alignSelf: 'flex-start',
    width: '100%',
  },
  required: {
    color: colors.danger,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  signUpButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  signUpButtonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  photoButton: {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  photoButtonText: { color: colors.primary, fontWeight: '600' },
  backLink: {
    marginTop: 16,
  },
  backLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
