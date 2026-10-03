import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMyViolations } from '../api/citationApi';
import colors from '../theme/colors';

const TYPE_FILTERS = ['All', 'Citations', 'Warnings'];
const STATUS_FILTERS = ['All', 'Settled', 'Unsettled', 'Cancelled'];

export default function MyViolationsScreen({ navigation }) {
  const [violations, setViolations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const load = useCallback(() => {
    setIsLoading(true);
    setErrorMessage('');
    fetchMyViolations()
      .then((res) => setViolations(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load your violations.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh after returning from hosted checkout so a newly settled
  // citation shows its updated status without manual reload.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    return violations.filter((v) => {
      if (typeFilter === 'Citations' && v.recordType !== 'citation') return false;
      if (typeFilter === 'Warnings' && v.recordType !== 'warning') return false;
      if (statusFilter === 'Settled' && v.settlementStatus !== 'settled') return false;
      if (statusFilter === 'Unsettled' && v.settlementStatus !== 'pending') return false;
      if (statusFilter === 'Cancelled' && v.settlementStatus !== 'cancelled') return false;
      return true;
    });
  }, [violations, typeFilter, statusFilter]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Home')}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Violations</Text>
      </View>

      <View style={styles.filterBar}>
        <FilterRow options={TYPE_FILTERS} active={typeFilter} onSelect={setTypeFilter} />
        <FilterRow options={STATUS_FILTERS} active={statusFilter} onSelect={setStatusFilter} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.citationId)}
          contentContainerStyle={{ padding: 20 }}
          ListHeaderComponent={<Text style={styles.countText}>{filtered.length} Violation(s)</Text>}
          ListEmptyComponent={<Text style={styles.emptyText}>No violations match this filter.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('ViolationDetail', { citationId: item.citationId })}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconBox, { backgroundColor: item.recordType === 'warning' ? '#FEF3C7' : '#FDECEC' }]}>
                  <Text>{item.recordType === 'warning' ? '📋' : '📄'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.citationNumber}>{item.citationNumber}</Text>
                  <Text style={styles.violationName}>
                    {item.violations?.[0]?.violationType?.description || item.otherViolation || 'Violation'}
                  </Text>
                </View>
                <StatusPill status={item.settlementStatus} />
              </View>
              <Text style={styles.dateText}>
                📅 {new Date(item.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <Text style={styles.locationText}>📍 {item.placeOfViolation}</Text>
              {item.settlementStatus === 'pending' && item.dueDate ? (
                <DueDateLine dueDate={item.dueDate} />
              ) : null}
              <View style={styles.cardBottom}>
                {item.recordType === 'warning' ? (
                  <Text style={styles.warningLabel}>Warning</Text>
                ) : (
                  <Text style={styles.fineAmount}>₱{Number(item.fineAmount).toLocaleString()}</Text>
                )}
                <Text style={styles.viewReceipt}>View Receipt →</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function FilterRow({ options, active, onSelect }) {
  return (
    <View style={styles.filterRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.filterChip, active === opt && styles.filterChipActive]}
          onPress={() => onSelect(opt)}
        >
          <Text style={[styles.filterChipText, active === opt && styles.filterChipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function DueDateLine({ dueDate }) {
  const daysLeft = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
  const formatted = new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (daysLeft < 0) {
    return <Text style={styles.overdueText}>⏰ Overdue — was due {formatted}</Text>;
  }
  if (daysLeft === 0) {
    return <Text style={styles.dueSoonText}>⏰ Due today ({formatted})</Text>;
  }
  return (
    <Text style={daysLeft <= 3 ? styles.dueSoonText : styles.dueText}>
      ⏰ Due {formatted} ({daysLeft} day{daysLeft !== 1 ? 's' : ''} left)
    </Text>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: { label: 'Unsettled', bg: '#FEF3C7', color: '#D97706' },
    settled: { label: 'Settled', bg: '#DCFCE7', color: '#16A34A' },
    cancelled: { label: 'Cancelled', bg: '#F3F4F6', color: '#6B7280' },
    warning_only: { label: 'Warning', bg: '#FEF3C7', color: '#D97706' },
  };
  const s = map[status] || map.pending;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.color }]}>{s.label}</Text>
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
  filterBar: { backgroundColor: '#FFFFFF', paddingVertical: 10, gap: 8 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: colors.background },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  filterChipTextActive: { color: '#FFFFFF' },
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 30 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30 },
  countText: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  citationNumber: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  violationName: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  pillText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 12, color: colors.textSecondary, marginTop: 10 },
  locationText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  dueText: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  dueSoonText: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: 4 },
  overdueText: { fontSize: 12, color: colors.danger, fontWeight: '700', marginTop: 4 },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fineAmount: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  warningLabel: { fontSize: 13, fontWeight: '700', color: colors.warning },
  viewReceipt: { fontSize: 12, fontWeight: '600', color: colors.primary },
});
