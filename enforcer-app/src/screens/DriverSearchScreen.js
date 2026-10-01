import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { searchDrivers, quickCreateDriver } from '../api/driverApi';
import colors from '../theme/colors';

export default function DriverSearchScreen({ navigation, route }) {
  // mode: 'issueCitation' navigates into the wizard after picking a driver;
  // 'lookup' (from Home's "Search Driver") just shows the driver record.
  const mode = route.params?.mode || 'issueCitation';

  const [licenseNumber, setLicenseNumber] = useState('');
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  async function handleSearch() {
    setErrorMessage('');
    if (!licenseNumber.trim()) {
      setErrorMessage('Enter the License No. from the physical license to search. Name search is disabled for privacy.');
      return;
    }

    setIsSearching(true);
    setSearched(false);
    try {
      const response = await searchDrivers({
        licenseNumber: licenseNumber.trim(),
      });
      setResults(response.data.data);
      setSearched(true);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }

  function handleSelectDriver(driver) {
    if (mode === 'lookup') {
      navigation.navigate('DriverRecord', { driverId: driver.driverId });
    } else {
      navigation.navigate('IssueCitation', { driver });
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver Search</Text>
        </View>

        <Text style={styles.title}>Search Driver</Text>
        <Text style={styles.subtitle}>License No. only — protects driver privacy</Text>

        <View style={styles.card}>
          <Text style={styles.label}>
            Driver's License Number<Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. G-75-45-571924"
            placeholderTextColor={colors.placeholder}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            autoCapitalize="characters"
          />
          <Text style={styles.privacyNote}>For privacy, enforcers can only look up a driver with the exact License No. from the physical license.</Text>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={isSearching}>
            {isSearching ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.searchButtonText}>🔍 Search Records</Text>
            )}
          </TouchableOpacity>
        </View>

        {searched && results && results.length > 0 && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsHeading}>{results.length} result(s) found</Text>
            {results.map((driver) => (
              <TouchableOpacity
                key={driver.driverId}
                style={styles.resultCard}
                onPress={() => handleSelectDriver(driver)}
              >
                <Text style={styles.resultName}>
                  {driver.firstName} {driver.lastName}
                </Text>
                <Text style={styles.resultLicense}>{driver.licenseNumber}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {searched && results && results.length === 0 && (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>No driver found for that search.</Text>
            {mode === 'issueCitation' && (
              <TouchableOpacity style={styles.quickCreateLink} onPress={() => setShowQuickCreate(true)}>
                <Text style={styles.quickCreateLinkText}>+ Create a new driver record</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {showQuickCreate && (
          <QuickCreateForm
            prefillLicense={licenseNumber}
            onCreated={(driver) => handleSelectDriver(driver)}
            onCancel={() => setShowQuickCreate(false)}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function QuickCreateForm({ prefillLicense, onCreated, onCancel }) {
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState(prefillLicense || '');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [licensePhoto, setLicensePhoto] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCapturePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to photograph the license.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.length) {
      setLicensePhoto(result.assets[0]);
    }
  }

  async function handleCreate() {
    setErrorMessage('');
    if (!firstName.trim() || !lastName.trim() || !licenseNumber.trim()) {
      setErrorMessage('First name, last name, and license number are required.');
      return;
    }
    if (!licensePhoto) {
      setErrorMessage('A photo of the license is required — this is what the admin will use to verify this record.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await quickCreateDriver(
        {
          firstName: firstName.trim(),
          middleInitial: middleInitial.trim() || undefined,
          lastName: lastName.trim(),
          licenseNumber: licenseNumber.trim(),
          address: address.trim() || undefined,
          contactNumber: contactNumber.trim() || undefined,
        },
        licensePhoto
      );
      onCreated(response.data.data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to create driver record.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.quickCreateCard}>
      <Text style={styles.quickCreateTitle}>New Driver Record</Text>
      <Text style={styles.quickCreateSubtitle}>Enter details exactly as shown on the driver's license.</Text>

      <View style={styles.row}>
        <View style={{ flex: 2 }}>
          <Text style={styles.label}>First Name *</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.label}>M.I.</Text>
          <TextInput style={styles.input} value={middleInitial} onChangeText={setMiddleInitial} maxLength={2} />
        </View>
      </View>

      <Text style={styles.label}>Last Name *</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoCapitalize="words" />

      <Text style={styles.label}>License Number *</Text>
      <TextInput style={styles.input} value={licenseNumber} onChangeText={setLicenseNumber} autoCapitalize="characters" />

      <Text style={styles.label}>Address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} />

      <Text style={styles.label}>Contact Number</Text>
      <TextInput style={styles.input} value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />

      <Text style={styles.label}>
        Photo of License<Text style={styles.required}> *</Text>
      </Text>
      <Text style={styles.photoHint}>This is what the admin will review to verify this record.</Text>
      {licensePhoto ? (
        <View style={styles.licensePhotoPreviewWrapper}>
          <Image source={{ uri: licensePhoto.uri }} style={styles.licensePhotoPreview} />
          <TouchableOpacity style={styles.retakeButton} onPress={handleCapturePhoto}>
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.capturePhotoButton} onPress={handleCapturePhoto}>
          <Text style={styles.capturePhotoButtonText}>📷 Take Photo of License</Text>
        </TouchableOpacity>
      )}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.quickCreateActions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Create & Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  backArrow: { color: '#FFFFFF', fontSize: 22, marginRight: 14 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 24,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
    marginTop: 12,
  },
  required: { color: colors.danger },
  privacyNote: { fontSize: 11, color: colors.textSecondary, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 12 },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  searchButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  resultsSection: { marginTop: 20, paddingHorizontal: 20 },
  resultsHeading: { fontSize: 13, color: colors.textSecondary, marginBottom: 10 },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  resultLicense: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  noResults: { marginTop: 24, alignItems: 'center', paddingHorizontal: 20 },
  noResultsText: { color: colors.textSecondary, fontSize: 14 },
  quickCreateLink: { marginTop: 12 },
  quickCreateLinkText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  quickCreateCard: {
    backgroundColor: colors.card,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    padding: 20,
  },
  quickCreateTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  quickCreateSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 8 },
  row: { flexDirection: 'row' },
  photoHint: { fontSize: 11, color: colors.textSecondary, marginBottom: 8 },
  capturePhotoButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  capturePhotoButtonText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  licensePhotoPreviewWrapper: { alignItems: 'center' },
  licensePhotoPreview: { width: '100%', height: 140, borderRadius: 10, marginBottom: 8 },
  retakeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retakeButtonText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  quickCreateActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: { color: colors.textPrimary, fontWeight: '600' },
  createButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  createButtonText: { color: '#FFFFFF', fontWeight: '600' },
});
