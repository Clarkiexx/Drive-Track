import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fetchMyCitations } from '../api/citationApi';
import colors from '../theme/colors';

const DATE_FILTERS = ['All', 'Today', 'This Week', 'This Month'];
const TYPE_FILTERS = ['All', 'Citations', 'Warnings'];

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

function isSameWeek(date, now) {
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function isSameMonth(date, now) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export default function PreviousCitationsScreen({ navigation }) {
  const [citations, setCitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  useEffect(() => {
    fetchMyCitations()
      .then((res) => setCitations(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load citations.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    return citations.filter((c) => {
      if (typeFilter === 'Citations' && c.recordType !== 'citation') return false;
      if (typeFilter === 'Warnings' && c.recordType !== 'warning') return false;

      if (activeFilter === 'All') return true;
      const occurred = new Date(c.occurredAt);
      if (activeFilter === 'Today') return isSameDay(occurred, now);
      if (activeFilter === 'This Week') return isSameWeek(occurred, now);
      if (activeFilter === 'This Month') return isSameMonth(occurred, now);
      return true;
    });
  }, [citations, activeFilter, typeFilter]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Previous Citations</Text>
      </View>

      <View style={styles.filterRow}>
        {TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
            onPress={() => setTypeFilter(f)}
          >
            <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.filterRow}>
        {DATE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
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
          ListEmptyComponent={<Text style={styles.emptyText}>No citations found for this filter.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.citationCard}
              onPress={() => navigation.navigate('CitationSuccess', { citation: item })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.citationNumber}>{item.citationNumber}</Text>
                <Text style={styles.driverName}>
                  {item.Driver?.firstName} {item.Driver?.lastName}
                </Text>
                <Text style={styles.violationSummary}>
                  {item.violations?.[0]?.violationType?.description || 'No violation listed'}
                  {item.violations?.length > 1 ? ` +${item.violations.length - 1} more` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <StatusPill status={item.settlementStatus} />
                <Text style={styles.dateText}>
                  {new Date(item.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 30 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30 },
  citationCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  citationNumber: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  driverName: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  violationSummary: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  pillText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
});
