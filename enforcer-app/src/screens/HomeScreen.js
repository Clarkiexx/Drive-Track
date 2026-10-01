import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { fetchMyCitations } from '../api/citationApi';
import colors from '../theme/colors';

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

export default function HomeScreen({ navigation }) {
  const { enforcer, signOut } = useAuth();
  const [stats, setStats] = useState({ today: 0, thisWeek: 0, thisMonth: 0 });

  useEffect(() => {
    // Computed client-side from the enforcer's own citations — no dedicated
    // stats endpoint yet, and at this scale (one enforcer's own records)
    // that's cheap enough to do on the device rather than the server.
    fetchMyCitations()
      .then((res) => {
        const citations = res.data.data;
        const now = new Date();
        setStats({
          today: citations.filter((c) => isSameDay(new Date(c.occurredAt), now)).length,
          thisWeek: citations.filter((c) => isSameWeek(new Date(c.occurredAt), now)).length,
          thisMonth: citations.filter((c) => isSameMonth(new Date(c.occurredAt), now)).length,
        });
      })
      .catch(() => {
        // Non-critical — stats just stay at 0 if this fails.
      });
  }, []);

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>DriveTrack</Text>
          <TouchableOpacity onPress={signOut}>
            <Text style={styles.logout}>⎋</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.welcome}>Good morning,</Text>
        <Text style={styles.name}>{enforcer ? `Officer ${enforcer.lastName}` : 'Officer'}</Text>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsHeading}>Citations Issued</Text>
        <View style={styles.statsRow}>
          <StatBlock value={stats.today} label="Today" color="#2563EB" />
          <StatBlock value={stats.thisWeek} label="This Week" color="#16A34A" />
          <StatBlock value={stats.thisMonth} label="This Month" color="#7C3AED" />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <ActionCard
          icon="📋"
          label="Issue Citation"
          onPress={() => navigation.navigate('DriverSearch', { mode: 'issueCitation' })}
        />
        <ActionCard
          icon="🔍"
          label="Search Driver"
          onPress={() => navigation.navigate('DriverSearch', { mode: 'lookup' })}
        />
        <ActionCard icon="🕒" label="Previous Citations" onPress={() => navigation.navigate('PreviousCitations')} />
        <ActionCard icon="👤" label="My Profile" onPress={() => navigation.navigate('Profile')} />
        <ActionCard icon="🔔" label="Notifications" onPress={() => navigation.navigate('Notifications')} />
      </View>
    </ScrollView>
  );
}

function StatBlock({ value, label, color }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primaryDark, paddingTop: 54, paddingBottom: 24, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  logout: { color: '#FFFFFF', fontSize: 18 },
  welcome: { color: '#E8F0E9', fontSize: 13, marginTop: 16 },
  name: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginTop: 2 },
  statsCard: {
    backgroundColor: colors.card,
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statsHeading: { fontSize: 13, color: colors.textSecondary, marginBottom: 14 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 28, marginLeft: 20, marginBottom: 12 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingBottom: 40 },
  actionCard: {
    width: '44%',
    margin: '3%',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: { fontSize: 26, marginBottom: 8 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
});
