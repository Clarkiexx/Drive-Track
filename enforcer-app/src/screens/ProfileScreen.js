import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { fetchMyCitations } from '../api/citationApi';
import colors from '../theme/colors';

export default function ProfileScreen({ navigation }) {
  const { enforcer, signOut } = useAuth();
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, settledRate: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMyCitations()
      .then((res) => {
        const citations = res.data.data;
        const now = new Date();
        const thisMonth = citations.filter((c) => {
          const d = new Date(c.occurredAt);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
        const settleable = citations.filter((c) => c.recordType !== 'warning');
        const settled = settleable.filter((c) => c.settlementStatus === 'settled').length;
        const settledRate = settleable.length > 0 ? Math.round((settled / settleable.length) * 100) : 0;
        setStats({ total: citations.length, thisMonth, settledRate });
      })
      .catch(() => {
        // Non-critical — profile stats just show 0 if this fails.
      })
      .finally(() => setIsLoading(false));
  }, []);

  const initials = enforcer ? `${enforcer.firstName?.[0] || ''}${enforcer.lastName?.[0] || ''}`.toUpperCase() : '';

  return (
    <ScrollView style={styles.screen}>
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
        <Text style={styles.name}>Officer {enforcer?.firstName} {enforcer?.lastName}</Text>
        <Text style={styles.badgeText}>Badge #{enforcer?.badgeNumber || '—'}</Text>
      </View>

      <View style={styles.card}>
        <InfoRow icon="🛡️" label="Badge Number" value={enforcer?.badgeNumber || '—'} />
        <InfoRow icon="📍" label="Station" value={enforcer?.station || '—'} />

        <Text style={styles.statsHeading}>🏅 Performance Stats</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
        ) : (
          <View style={styles.statsRow}>
            <StatBox value={stats.total} label="Total Citations" color="#2563EB" />
            <StatBox value={stats.thisMonth} label="This Month" color="#16A34A" />
            <StatBox value={`${stats.settledRate}%`} label="Settled Rate" color="#7C3AED" />
          </View>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>⎋ Logout</Text>
        </TouchableOpacity>
      </View>
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

function StatBox({ value, label, color }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
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
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginTop: 10 },
  badgeText: { fontSize: 13, color: colors.textSecondary },
  card: { backgroundColor: colors.card, margin: 20, borderRadius: 14, padding: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  infoIcon: { fontSize: 18 },
  infoLabel: { fontSize: 11, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  statsHeading: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: 8, marginBottom: 12 },
  statsRow: { flexDirection: 'row', marginBottom: 20 },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  logoutButton: { backgroundColor: colors.danger, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  logoutText: { color: '#FFFFFF', fontWeight: '600' },
});
