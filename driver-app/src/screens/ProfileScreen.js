import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { updateMyProfile, uploadMyPhoto } from '../api/profileApi';
import { changePassword } from '../api/authApi';
import { getMediaUrl } from '../config';
import colors from '../theme/colors';

export default function ProfileScreen({ navigation }) {
  const { driver, signIn, updateDriver, signOut } = useAuth();

  const initials = driver ? `${driver.firstName?.[0] || ''}${driver.lastName?.[0] || ''}`.toUpperCase() : '';
  const status = driver?.verificationStatus || 'pending';
  const statusMeta = {
    pending: { label: 'Pending Review', bg: '#FEF3C7', fg: '#92400E', hint: 'Your license photo is under review. Full access unlocks after verification.' },
    verified: { label: '✓ Verified', bg: '#DCFCE7', fg: '#166534', hint: null },
    flagged: { label: 'Flagged for Review', bg: '#FFEDD5', fg: '#9A3412', hint: driver?.statusReason || 'Your account was flagged. Please contact CTMO.' },
    revoked: { label: 'Revoked', bg: '#FEE2E2', fg: '#991B1B', hint: driver?.statusReason || 'Your account was revoked. Please contact CTMO.' },
    suspended: { label: 'Suspended', bg: '#FEE2E2', fg: '#991B1B', hint: 'Your account is suspended. Please contact CTMO.' },
  }[status] || { label: status, bg: '#F3F4F6', fg: '#374151', hint: null };

  const avatarUri = driver?.profilePhotoPath ? getMediaUrl(driver.profilePhotoPath) : '';

  // --- Avatar upload ---
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  async function handleChangePhoto() {
    const { status: permission } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access so you can choose a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setIsUploadingPhoto(true);
    try {
      const res = await uploadMyPhoto(result.assets[0].uri);
      await updateDriver(res.data?.data);
      Alert.alert('Profile photo updated', 'Your new profile picture is now showing.');
    } catch (err) {
      Alert.alert(
        'Upload failed',
        err.response?.data?.message || 'Unable to upload the photo. Please try again.'
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  // --- Edit personal details ---
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(driver?.firstName || '');
  const [middleInitial, setMiddleInitial] = useState(driver?.middleInitial || '');
  const [lastName, setLastName] = useState(driver?.lastName || '');
  const [address, setAddress] = useState(driver?.address || '');
  const [contactNumber, setContactNumber] = useState(driver?.contactNumber || '');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function startEditing() {
    // Refresh the form from the latest saved record every time it opens.
    setFirstName(driver?.firstName || '');
    setMiddleInitial(driver?.middleInitial || '');
    setLastName(driver?.lastName || '');
    setAddress(driver?.address || '');
    setContactNumber(driver?.contactNumber || '');
    setEditError('');
    setIsEditing(true);
  }

  async function handleSaveDetails() {
    setEditError('');
    if (!firstName.trim() || !lastName.trim()) {
      setEditError('First name and last name are required.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await updateMyProfile({
        firstName: firstName.trim(),
        middleInitial: middleInitial.trim() || null,
        lastName: lastName.trim(),
        address: address.trim() || null,
        contactNumber: contactNumber.trim() || null,
      });
      await updateDriver(res.data?.data);
      setIsEditing(false);
      Alert.alert('Profile updated', 'Your personal details have been saved.');
    } catch (err) {
      setEditError(err.response?.data?.message || 'Unable to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  // --- Change password (same endpoint/contract as ChangePasswordScreen) ---
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  async function handleChangePassword() {
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await changePassword(newPassword);
      const freshToken = res.data?.data?.token;
      if (freshToken) {
        // Replace the JWT — same refresh pattern as ChangePasswordScreen.
        await signIn({ token: freshToken, driver, mustChangePassword: false });
      }
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'Your password has been changed successfully.');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Unable to update password. Please try again.');
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <View style={styles.avatarSection}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        <TouchableOpacity onPress={handleChangePhoto} disabled={isUploadingPhoto}>
          <Text style={styles.changePhotoLink}>
            {isUploadingPhoto ? 'Uploading…' : avatarUri ? 'Change profile picture' : 'Add profile picture'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.driverName}>{driver ? `${driver.firstName} ${driver.lastName}` : ''}</Text>
        <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
          <Text style={[styles.badgeText, { color: statusMeta.fg }]}>{statusMeta.label}</Text>
        </View>
        {statusMeta.hint ? <Text style={styles.hint}>{statusMeta.hint}</Text> : null}
      </View>

      <View style={styles.card}>
        <InfoRow icon="💳" label="License Number" value={driver?.licenseNumber || '—'} />
        {driver?.address ? <InfoRow icon="📍" label="Address" value={driver.address} /> : null}
        {driver?.contactNumber ? <InfoRow icon="📞" label="Contact Number" value={driver.contactNumber} /> : null}

        {!isEditing ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={startEditing}>
            <Text style={styles.secondaryButtonText}>Edit personal details</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.editForm}>
            <Text style={styles.formLabel}>First Name *</Text>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            <Text style={styles.formLabel}>M.I.</Text>
            <TextInput style={styles.input} value={middleInitial} onChangeText={setMiddleInitial} maxLength={5} autoCapitalize="characters" />
            <Text style={styles.formLabel}>Last Name *</Text>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            <Text style={styles.formLabel}>Address</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} />
            <Text style={styles.formLabel}>Contact Number</Text>
            <TextInput style={styles.input} value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />

            {editError ? <Text style={styles.errorText}>{editError}</Text> : null}

            <View style={styles.formRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, styles.formRowButton]}
                onPress={() => setIsEditing(false)}
                disabled={isSaving}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.formRowButton]}
                onPress={handleSaveDetails}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Change password</Text>
        <Text style={styles.formLabel}>New Password</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.placeholder}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
        <Text style={styles.formLabel}>Confirm New Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Re-enter your new password"
          placeholderTextColor={colors.placeholder}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
        <TouchableOpacity style={styles.primaryButton} onPress={handleChangePassword} disabled={isChangingPassword}>
          {isChangingPassword ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Update password</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>⎋ Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  header: {
    backgroundColor: colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  backArrow: { color: '#FFFFFF', fontSize: 22, marginRight: 14 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  avatarSection: { alignItems: 'center', marginTop: -30 },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: colors.border,
  },
  avatarText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  changePhotoLink: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: 8 },
  driverName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginTop: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
  card: { backgroundColor: colors.card, margin: 20, marginBottom: 0, borderRadius: 14, padding: 18 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  infoIcon: { fontSize: 18 },
  infoLabel: { fontSize: 11, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: { color: colors.textPrimary, fontWeight: '600' },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '600' },
  editForm: { marginTop: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
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
  errorText: { color: colors.danger, fontSize: 13, marginTop: 12 },
  formRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  formRowButton: { flex: 1, marginTop: 14 },
  logoutButton: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
  },
  logoutText: { color: '#FFFFFF', fontWeight: '600' },
});
