import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';
import colors from '../theme/colors';

export default function ProfileScreen({ navigation }) {
  const { driver, signOut } = useAuth();

  const initials = driver ? `${driver.firstName?.[0] || ''}${driver.lastName?.[0] || ''}`.toUpperCase() : '';
  const status = driver?.verificationStatus || 'pending';
  const statusMeta = {
    pending: { label: 'Pending Review', bg: '#FEF3C7', fg: '#92400E', hint: 'Your license photo is under review. Full access unlocks after verification.' },
    verified: { label: '✓ Verified', bg: '#DCFCE7', fg: '#166534', hint: null },
    flagged: { label: 'Flagged for Review', bg: '#FFEDD5', fg: '#9A3412', hint: driver?.statusReason || 'Your account was flagged. Please contact CTMO.' },
    revoked: { label: 'Revoked', bg: '#FEE2E2', fg: '#991B1B', hint: driver?.statusReason || 'Your account was revoked. Please contact CTMO.' },
    suspended: { label: 'Suspended', bg: '#FEE2E2', fg: '#991B1B', hint: 'Your account is suspended. Please contact CTMO.' },
  }[status] || { label: status, bg: '#F3F4F6', fg: '#374151', hint: null };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
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
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>⎋ Logout</Text>
      </TouchableOpacity>
    </View>
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
  avatarText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  driverName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginTop: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
  card: { backgroundColor: colors.card, margin: 20, borderRadius: 14, padding: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  infoIcon: { fontSize: 18 },
  infoLabel: { fontSize: 11, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  logoutButton: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 10,
  },
  logoutText: { color: '#FFFFFF', fontWeight: '600' },
});
