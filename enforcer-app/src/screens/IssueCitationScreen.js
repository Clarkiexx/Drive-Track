import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { fetchActiveViolationTypes } from '../api/violationTypeApi';
import { submitCitation } from '../api/citationApi';
import colors from '../theme/colors';

const TOTAL_STEPS = 4;

export default function IssueCitationScreen({ navigation, route }) {
  const driver = route.params?.driver;

  const [step, setStep] = useState(1);
  const [recordType, setRecordType] = useState('citation'); // 'citation' | 'warning'

  // Step 1
  const [driverFullName] = useState(driver ? `${driver.firstName} ${driver.lastName}` : '');
  const [driverAddress, setDriverAddress] = useState(driver?.address || '');
  const [licenseNumber] = useState(driver?.licenseNumber || '');

  // Step 2
  const [vehicleUnitType, setVehicleUnitType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [registeredOwner, setRegisteredOwner] = useState('');

  // Step 3
  const [violationTypes, setViolationTypes] = useState([]);
  const [selectedViolationIds, setSelectedViolationIds] = useState([]);
  const [otherViolation, setOtherViolation] = useState('');
  const [placeOfViolation, setPlaceOfViolation] = useState('');
  const occurredAt = useState(new Date())[0]; // fixed at the moment the wizard opened

  // Step 4
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [driverUnderProtest, setDriverUnderProtest] = useState(null); // true | false | null

  const [stepError, setStepError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchActiveViolationTypes()
      .then((res) => setViolationTypes(res.data.data))
      .catch(() => setStepError('Unable to load violation types. Check your connection.'));
  }, []);

  useEffect(() => {
    if (step === 4 && !location) {
      captureLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function captureLocation() {
    setLocationError('');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationError('Location permission denied. GPS coordinates are required for citation records.');
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      setLocationError('Unable to get current location. Make sure GPS is enabled.');
    }
  }

  function toggleViolation(id) {
    setSelectedViolationIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to capture evidence photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.length) {
      addPhoto(result.assets[0]);
    }
  }

  async function handlePickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
    if (!result.canceled && result.assets?.length) {
      result.assets.forEach(addPhoto);
    }
  }

  function addPhoto(asset) {
    setPhotos((prev) => {
      if (prev.length >= 5) {
        Alert.alert('Limit reached', 'You can attach up to 5 photos per citation.');
        return prev;
      }
      return [...prev, asset];
    });
  }

  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function validateStep() {
    setStepError('');
    if (step === 1) {
      if (!driverAddress.trim()) {
        setStepError('Driver address is required.');
        return false;
      }
    }
    if (step === 2) {
      if (!plateNumber.trim()) {
        setStepError('Plate number is required.');
        return false;
      }
      if (!registeredOwner.trim()) {
        setStepError('Registered owner is required.');
        return false;
      }
      if (!vehicleUnitType.trim()) {
        setStepError('Vehicle unit type is required.');
        return false;
      }
    }
    if (step === 3) {
      if (selectedViolationIds.length === 0) {
        setStepError('Select at least one violation.');
        return false;
      }
      if (!placeOfViolation.trim()) {
        setStepError('Place of violation is required.');
        return false;
      }
    }
    if (step === 4) {
      if (!location) {
        setStepError(locationError || 'GPS coordinates are required. Wait for location capture or tap Retry.');
        return false;
      }
      if (driverUnderProtest === null) {
        setStepError('Please indicate whether the driver is under protest.');
        return false;
      }
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function goBack() {
    setStepError('');
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep((s) => s - 1);
    }
  }

  async function handleSubmit() {
    if (!driver || !validateStep()) return;

    setIsSubmitting(true);
    try {
      const response = await submitCitation(
        {
          driverId: driver.driverId,
          recordType,
          address: driverAddress,
          vehicleUnitType,
          plateNumber,
          registeredOwner,
          violationTypeIds: selectedViolationIds,
          otherViolation,
          placeOfViolation,
          latitude: location?.latitude,
          longitude: location?.longitude,
          driverUnderProtest,
        },
        photos
      );
      navigation.replace('CitationSuccess', { citation: response.data.data });
    } catch (err) {
      setStepError(err.response?.data?.message || 'Unable to submit citation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Guard sits after all hooks so hook order never changes. Without a
  // driver the wizard cannot render or submit — show a fallback instead.
  if (!driver) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Issue Citation</Text>
        </View>
        <Text style={styles.emptyText}>No driver selected. Go back and search for a driver first.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back to Search</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Issue Citation</Text>
        </View>

        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>Step {step} of {TOTAL_STEPS}</Text>
          <Text style={styles.progressLabel}>{Math.round((step / TOTAL_STEPS) * 100)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
        </View>

        {step === 1 && (
          <View style={styles.recordTypeRow}>
            <TouchableOpacity
              style={[styles.recordTypeOption, recordType === 'citation' && styles.recordTypeOptionSelected]}
              onPress={() => setRecordType('citation')}
            >
              <Text style={recordType === 'citation' ? styles.recordTypeTextSelected : styles.recordTypeText}>
                📄 Citation
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.recordTypeOption, recordType === 'warning' && styles.recordTypeOptionSelected]}
              onPress={() => setRecordType('warning')}
            >
              <Text style={recordType === 'warning' ? styles.recordTypeTextSelected : styles.recordTypeText}>
                🔶 Warning
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.body}>
          {step === 1 && (
            <StepDriverInfo
              fullName={driverFullName}
              address={driverAddress}
              onAddressChange={setDriverAddress}
              licenseNumber={licenseNumber}
            />
          )}

          {step === 2 && (
            <StepVehicleInfo
              unitType={vehicleUnitType}
              onUnitTypeChange={setVehicleUnitType}
              plateNumber={plateNumber}
              onPlateNumberChange={setPlateNumber}
              registeredOwner={registeredOwner}
              onRegisteredOwnerChange={setRegisteredOwner}
            />
          )}

          {step === 3 && (
            <StepViolationDetails
              violationTypes={violationTypes}
              selectedIds={selectedViolationIds}
              onToggle={toggleViolation}
              otherViolation={otherViolation}
              onOtherViolationChange={setOtherViolation}
              placeOfViolation={placeOfViolation}
              onPlaceChange={setPlaceOfViolation}
              occurredAt={occurredAt}
              recordType={recordType}
            />
          )}

          {step === 4 && (
            <StepDocumentation
              location={location}
              locationError={locationError}
              onRetryLocation={captureLocation}
              photos={photos}
              onTakePhoto={handleTakePhoto}
              onPickFromGallery={handlePickFromGallery}
              onRemovePhoto={removePhoto}
              driverUnderProtest={driverUnderProtest}
              onDriverUnderProtestChange={setDriverUnderProtest}
            />
          )}

          {stepError ? <Text style={styles.errorText}>{stepError}</Text> : null}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          {step < TOTAL_STEPS ? (
            <TouchableOpacity style={styles.nextButton} onPress={goNext}>
              <Text style={styles.nextButtonText}>Next →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextButton} onPress={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.nextButtonText}>✓ Submit Citation</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StepDriverInfo({ fullName, address, onAddressChange, licenseNumber }) {
  return (
    <View>
      <Text style={styles.stepTitle}>Driver Information</Text>
      <Text style={styles.label}>Driver Full Name</Text>
      <TextInput style={[styles.input, styles.inputDisabled]} value={fullName} editable={false} />

      <Text style={styles.label}>Driver Address</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., 123 Rizal St., Manila"
        placeholderTextColor={colors.placeholder}
        value={address}
        onChangeText={onAddressChange}
      />

      <Text style={styles.label}>License Number</Text>
      <TextInput style={[styles.input, styles.inputDisabled]} value={licenseNumber} editable={false} />
    </View>
  );
}

function StepVehicleInfo({
  unitType,
  onUnitTypeChange,
  plateNumber,
  onPlateNumberChange,
  registeredOwner,
  onRegisteredOwnerChange,
}) {
  return (
    <View>
      <Text style={styles.stepTitle}>Vehicle Information</Text>
      <Text style={styles.label}>Unit Type<Text style={styles.required}> *</Text></Text>
      <TextInput style={styles.input} placeholder="e.g., Sedan, Motorcycle" value={unitType} onChangeText={onUnitTypeChange} />

      <Text style={styles.label}>Plate Number<Text style={styles.required}> *</Text></Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., ABC 1234"
        placeholderTextColor={colors.placeholder}
        value={plateNumber}
        onChangeText={onPlateNumberChange}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Registered Owner<Text style={styles.required}> *</Text></Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Maria Santos"
        placeholderTextColor={colors.placeholder}
        value={registeredOwner}
        onChangeText={onRegisteredOwnerChange}
      />
    </View>
  );
}

function StepViolationDetails({
  violationTypes,
  selectedIds,
  onToggle,
  otherViolation,
  onOtherViolationChange,
  placeOfViolation,
  onPlaceChange,
  occurredAt,
  recordType,
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const filtered = violationTypes.filter((vt) => {
    if (category !== 'all' && vt.category !== category) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return `${vt.articleSection} ${vt.description}`.toLowerCase().includes(q);
  });
  return (
    <View>
      <Text style={styles.stepTitle}>Violation Details</Text>
      <Text style={styles.selectedCount}>Selected: {selectedIds.length}</Text>
      {recordType === 'warning' && (
        <View style={styles.warningNote}>
          <Text style={styles.warningNoteText}>
            🔶 This will be issued as a Warning — no fine will be charged, but it's still recorded on the driver's history.
          </Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="🔍 Search violations..."
        placeholderTextColor={colors.placeholder}
        value={query}
        onChangeText={setQuery}
      />
      <View style={styles.categoryRow}>
        {[['all', 'All'], ['moving', 'Moving'], ['non_moving', 'Non-moving']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.categoryChip, category === key && styles.categoryChipActive]}
            onPress={() => setCategory(key)}
          >
            <Text style={[styles.categoryChipText, category === key && styles.categoryChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {violationTypes.length === 0 ? (
        <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />
      ) : filtered.length === 0 ? (
        <Text style={styles.noResultsText}>No violations match “{query}”. Try another keyword or use Other Violations below.</Text>
      ) : (
        <View style={styles.violationList}>
          {filtered.map((vt) => {
            const selected = selectedIds.includes(vt.violationTypeId);
            return (
              <TouchableOpacity
                key={vt.violationTypeId}
                style={[styles.violationOption, selected && styles.violationOptionSelected]}
                onPress={() => onToggle(vt.violationTypeId)}
              >
                <Text style={[styles.violationText, selected && styles.violationTextSelected]}>
                  {selected ? '✓ ' : ''}{vt.articleSection} | {vt.description} (₱{Number(vt.defaultPenalty).toLocaleString()})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Text style={styles.label}>Other Violations</Text>
      <TextInput
        style={styles.input}
        placeholder="Specify other violations..."
        placeholderTextColor={colors.placeholder}
        value={otherViolation}
        onChangeText={onOtherViolationChange}
      />

      <Text style={styles.label}>Place of Violation</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., EDSA-Ortigas Intersection"
        placeholderTextColor={colors.placeholder}
        value={placeOfViolation}
        onChangeText={onPlaceChange}
      />

      <View style={styles.dateTimeBox}>
        <Text style={styles.label}>Date & Time</Text>
        <Text style={styles.dateTimeValue}>
          {occurredAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at{' '}
          {occurredAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

function StepDocumentation({
  location,
  locationError,
  onRetryLocation,
  photos,
  onTakePhoto,
  onPickFromGallery,
  onRemovePhoto,
  driverUnderProtest,
  onDriverUnderProtestChange,
}) {
  return (
    <View>
      <Text style={styles.stepTitle}>Documentation</Text>

      <View style={styles.gpsBox}>
        <Text style={styles.gpsLabel}>📍 GPS Coordinates<Text style={styles.required}> *</Text></Text>
        {location ? (
          <>
            <Text style={styles.gpsValue}>
              {location.latitude.toFixed(4)}° N, {location.longitude.toFixed(4)}° E
            </Text>
            <Text style={styles.gpsSubtext}>Auto-captured location</Text>
          </>
        ) : locationError ? (
          <>
            <Text style={styles.errorText}>{locationError}</Text>
            <TouchableOpacity onPress={onRetryLocation}>
              <Text style={styles.retryLink}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.gpsSubtext}>Capturing location… wait before submitting.</Text>
          </>
        )}
      </View>

      <Text style={styles.label}>Photo Evidence</Text>
      <View style={styles.photoRow}>
        {photos.map((photo, index) => (
          <View key={photo.uri} style={styles.photoThumbWrapper}>
            <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
            <TouchableOpacity style={styles.removePhotoBtn} onPress={() => onRemovePhoto(index)}>
              <Text style={styles.removePhotoText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={styles.photoButtonsRow}>
        <TouchableOpacity style={styles.photoButton} onPress={onTakePhoto}>
          <Text style={styles.photoButtonText}>📷 Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoButton} onPress={onPickFromGallery}>
          <Text style={styles.photoButtonText}>🖼️ From Gallery</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>
        Driver Under Protest<Text style={styles.required}> *</Text>
      </Text>
      <View style={styles.protestRow}>
        <TouchableOpacity
          style={[styles.protestOption, driverUnderProtest === true && styles.protestOptionSelected]}
          onPress={() => onDriverUnderProtestChange(true)}
        >
          <Text style={driverUnderProtest === true ? styles.protestTextSelected : styles.protestText}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.protestOption, driverUnderProtest === false && styles.protestOptionSelected]}
          onPress={() => onDriverUnderProtestChange(false)}
        >
          <Text style={driverUnderProtest === false ? styles.protestTextSelected : styles.protestText}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.background, paddingBottom: 40 },
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
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 14,
  },
  progressLabel: { fontSize: 12, color: colors.textSecondary },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginHorizontal: 20,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.primary },
  recordTypeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 14 },
  recordTypeOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  recordTypeOptionSelected: { borderColor: colors.primary, backgroundColor: '#EAF4EB' },
  recordTypeText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  recordTypeTextSelected: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  warningNote: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 16 },
  warningNoteText: { fontSize: 12, color: '#92650B', lineHeight: 17 },
  body: { paddingHorizontal: 20, marginTop: 20 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 6, marginTop: 14 },
  required: { color: colors.danger },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: '#FFFFFF',
  },
  inputDisabled: { backgroundColor: '#F0F1F0', color: colors.textSecondary },
  errorText: { color: colors.danger, fontSize: 13, marginTop: 10 },
  violationOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  violationOptionSelected: { borderColor: colors.primary, backgroundColor: '#EAF4EB' },
  violationText: { fontSize: 13, color: colors.textPrimary },
  violationTextSelected: { color: colors.primaryDark, fontWeight: '600' },
  selectedCount: { fontSize: 12, fontWeight: '700', color: colors.primaryDark, marginBottom: 8 },
  categoryRow: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  categoryChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#FFFFFF' },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
  categoryChipTextActive: { color: '#FFFFFF' },
  violationList: { maxHeight: 320 },
  noResultsText: { fontSize: 13, color: colors.textSecondary, marginVertical: 12 },
  dateTimeBox: {
    backgroundColor: '#F0F1F0',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  dateTimeValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
  gpsBox: {
    backgroundColor: '#EAF4EB',
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
  },
  gpsLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  gpsValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  gpsSubtext: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  retryLink: { color: colors.primary, fontWeight: '600', marginTop: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  photoThumbWrapper: { position: 'relative' },
  photoThumb: { width: 80, height: 80, borderRadius: 8 },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.danger,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  photoButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  photoButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  photoButtonText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  protestRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  protestOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  protestOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  protestText: { color: colors.textPrimary, fontWeight: '600' },
  protestTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 28,
  },
  backButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  backButtonText: { color: colors.textPrimary, fontWeight: '600' },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30 },
  nextButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextButtonText: { color: '#FFFFFF', fontWeight: '600' },
});
