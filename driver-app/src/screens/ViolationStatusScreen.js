import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMyViolations } from '../api/citationApi';
import colors from '../theme/colors';

export default function ViolationStatusScreen({ navigation }) {
  const [violations, setViolations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setIsLoading(true);
    setErrorMessage('');
    fetchMyViolations()
      .then((res) => setViolations(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load violation status.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Overview/progress counts go stale after a payment settles elsewhere —
  // refresh whenever the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const stats = useMemo(() => {
    const total = violations.length;
    const settled = violations.filter((v) => v.settlementStatus === 'settled').length;
    const unsettled = violations.filter((v) => v.settlementStatus === 'pending').length;
    const warnings = violations.filter((v) => v.recordType === 'warning').length;
    const settleable = violations.filter((v) => v.recordType !== 'warning').length;
    const progressPct = settleable > 0 ? Math.round((settled / settleable) * 100) : 0;
    return { total, settled, unsettled, warnings, progressPct };
  }, [violations]);

  const recentActivity = useMemo(() => {
    return [...violations]
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, 5);
  }, [violations]);

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Violation Status</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Overview</Text>
            <View style={styles.statsGrid}>
              <StatBox icon="📄" value={stats.total} label="Total Violations" color="#2563EB" bg="#E7F0FE" />
              <StatBox icon="✅" value={stats.settled} label="Settled" color="#16A34A" bg="#DCFCE7" />
              <StatBox icon="⚠️" value={stats.unsettled} label="Unsettled" color="#DC2626" bg="#FDECEC" />
              <StatBox icon="🔶" value={stats.warnings} label="Warnings" color="#D97706" bg="#FEF3C7" />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Settlement Progress</Text>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Settled</Text>
              <Text style={styles.progressPct}>{stats.progressPct}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${stats.progressPct}%` }]} />
            </View>
            <View style={styles.progressBoxes}>
              <View style={[styles.progressBox, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.progressBoxLabel, { color: '#16A34A' }]}>Settled</Text>
                <Text style={[styles.progressBoxValue, { color: '#16A34A' }]}>{stats.settled}</Text>
              </View>
              <View style={[styles.progressBox, { backgroundColor: '#FDECEC' }]}>
                <Text style={[styles.progressBoxLabel, { color: '#DC2626' }]}>Pending</Text>
                <Text style={[styles.progressBoxValue, { color: '#DC2626' }]}>{stats.unsettled}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.card, { marginBottom: 30 }]}>
            <Text style={styles.cardTitle}>Recent Activity</Text>
            {recentActivity.length === 0 ? (
              <Text style={styles.emptyText}>No recent activity.</Text>
            ) : (
              recentActivity.map((v, i) => (
                <View key={v.citationId} style={[styles.activityRow, i === recentActivity.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.activityDot, { backgroundColor: v.settlementStatus === 'settled' ? '#16A34A' : '#D97706' }]} />
                  <View>
                    <Text style={styles.activityTitle}>
                      {v.settlementStatus === 'settled' ? 'Payment Received' : 'Citation Issued'}
                    </Text>
                    <Text style={styles.activitySubtitle}>
                      {v.violations?.[0]?.violationType?.description || 'Violation'} - {v.placeOfViolation}
                    </Text>
                    <Text style={styles.activityDate}>
                      {new Date(v.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function StatBox({ icon, value, label, color, bg }) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIconWrap, { backgroundColor: bg }]}>
        <Text>{icon}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 30 },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  card: { backgroundColor: colors.card, margin: 16, marginBottom: 0, borderRadius: 14, padding: 18 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statBox: { width: '46%', alignItems: 'center' },
  statIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 13, color: colors.textSecondary },
  progressPct: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.primary },
  progressBoxes: { flexDirection: 'row', gap: 12, marginTop: 16 },
  progressBox: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  progressBoxLabel: { fontSize: 12, fontWeight: '600' },
  progressBoxValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  activityRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  activityTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  activitySubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  activityDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
});
