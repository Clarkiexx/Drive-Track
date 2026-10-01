import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fetchDriverCitations } from '../api/driverApi';
import colors from '../theme/colors';

export default function DriverRecordScreen({ navigation, route }) {
  const { driverId, driver } = route.params;
  const [citations, setCitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchDriverCitations(driverId)
      .then((res) => setCitations(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load violation history.'))
      .finally(() => setIsLoading(false));
  }, [driverId]);

  const driverInfo = driver || citations[0]?.Driver;

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Record</Text>
      </View>

      {driverInfo && (
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle} />
          <Text style={styles.driverName}>
            {driverInfo.lastName}, {driverInfo.firstName}
          </Text>
          <Text style={styles.driverLicense}>💳 {driverInfo.licenseNumber}</Text>
          {driverInfo.address ? <Text style={styles.driverAddress}>📍 {driverInfo.address}</Text> : null}
        </View>
      )}

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Violation History</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{citations.length}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : citations.length === 0 ? (
        <Text style={styles.emptyText}>No prior violations on record.</Text>
      ) : (
        <View style={{ paddingHorizontal: 20, paddingBottom: 30 }}>
          {citations.map((c) => (
            <View key={c.citationId} style={styles.recordCard}>
              <Text style={styles.recordIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.recordDescription}>
                  {c.violations?.[0]?.violationType?.description || c.otherViolation || 'Violation'}
                </Text>
                <Text style={styles.recordId}>ID: {c.citationNumber}</Text>
                <Text style={styles.recordMeta}>
                  📅 {new Date(c.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} •{' '}
                  {new Date(c.occurredAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={styles.recordMeta}>📍 {c.placeOfViolation}</Text>
                {c.recordType !== 'warning' && (
                  <View style={styles.fineRow}>
                    <Text style={styles.fineAmount}>₱{Number(c.fineAmount).toLocaleString()}</Text>
                    <SettlementBadge status={c.settlementStatus} />
                  </View>
                )}
              </View>
              <RecordTypeBadge recordType={c.recordType} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SettlementBadge({ status }) {
  const map = {
    pending: { label: 'Unsettled', bg: '#FEF3C7', color: '#D97706' },
    settled: { label: 'Settled', bg: '#DCFCE7', color: '#16A34A' },
    cancelled: { label: 'Cancelled', bg: '#F3F4F6', color: '#6B7280' },
  };
  const s = map[status] || map.pending;
  return (
    <View style={[styles.settlementBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.settlementBadgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function RecordTypeBadge({ recordType }) {
  const map = {
    citation: { label: 'Citation', bg: '#FDECEC', color: colors.danger },
    warning: { label: 'Warning', bg: '#FEF3C7', color: colors.warning },
    violation: { label: 'Violation', bg: '#FDECEC', color: colors.danger },
  };
  const s = map[recordType] || map.citation;
  return (
    <View style={[styles.typeBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.typeBadgeText, { color: s.color }]}>{s.label}</Text>
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
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  backArrow: { color: '#FFFFFF', fontSize: 22, marginRight: 14 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  profileCard: {
    backgroundColor: colors.card,
    margin: 20,
    borderRadius: 14,
    padding: 20,
  },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border, marginBottom: 10 },
  driverName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  driverLicense: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 4 },
  driverAddress: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  historyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  countBadge: { backgroundColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 20 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 20 },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordIcon: { fontSize: 16, marginRight: 10, marginTop: 2 },
  recordDescription: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  recordId: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  recordMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  fineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  fineAmount: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  settlementBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  settlementBadgeText: { fontSize: 10, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginLeft: 8 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
});
