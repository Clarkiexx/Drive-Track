import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { fetchMyViolations } from '../api/citationApi';
import { fetchMyNotifications } from '../api/notificationApi';
import colors from '../theme/colors';

export default function HomeScreen({ navigation }) {
  const { driver, signOut } = useAuth();
  const [unsettledCount, setUnsettledCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [violationsRes, notificationsRes] = await Promise.all([
        fetchMyViolations(),
        fetchMyNotifications(),
      ]);
      setUnsettledCount(
        violationsRes.data.data.filter((v) => v.settlementStatus === 'pending').length
      );
      setUnreadCount(notificationsRes.data.data.filter((n) => n.status === 'unread').length);
    } catch {
      // Non-critical for the home screen — sections just show 0 if this fails.
    }
  }, []);

  // Refresh every time the driver returns to Home (e.g. after settling a
  // violation or reading notifications elsewhere in the app).
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>DriveTrack</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.bellIcon}>👤</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.bellWrapper}>
              <Text style={styles.bellIcon}>🔔</Text>
              {unreadCount > 0 && <View style={styles.badge} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut}>
              <Text style={styles.logoutButton}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.name}>{driver ? `${driver.firstName} ${driver.lastName}` : 'Driver'}</Text>
        {driver?.verificationStatus && driver.verificationStatus !== 'verified' && (
          <View style={styles.verifyBanner}>
            <Text style={styles.verifyBannerText}>
              {driver.verificationStatus === 'pending'
                ? '⏳ Account pending verification'
                : driver.verificationStatus === 'flagged'
                  ? '🚩 Account flagged — contact CTMO'
                  : '⛔ Account revoked — contact CTMO'}
            </Text>
          </View>
        )}
        {driver?.verificationStatus === 'verified' && (
          <Text style={styles.verifiedLine}>✓ Verified account</Text>
        )}
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusIcon}>{unsettledCount > 0 ? '⚠️' : '✅'}</Text>
          <View>
            <Text style={styles.statusLabel}>Current Status</Text>
            <Text style={styles.statusValue}>
              {unsettledCount > 0 ? `${unsettledCount} Unsettled Violation${unsettledCount > 1 ? 's' : ''}` : 'All Clear'}
            </Text>
          </View>
        </View>
        {unsettledCount > 0 && (
          <View style={styles.statusWarning}>
            <Text style={styles.statusWarningText}>
              You have pending violations. Please settle to avoid penalties.
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Quick Access</Text>
      <View style={styles.grid}>
        <QuickCard icon="📄" label="My Violations" color="#FDECEC" onPress={() => navigation.getParent()?.navigate('Violations')} />
        <QuickCard icon="📊" label="Violation Status" color="#E7F0FE" onPress={() => navigation.navigate('ViolationStatus')} />
        <QuickCard icon="🔔" label="Notifications" color="#FEF3D9" onPress={() => navigation.navigate('Notifications')} />
        <QuickCard icon="💬" label="AI Chatbot" color="#E7F7EC" onPress={() => navigation.getParent()?.navigate('Chat')} />
        <QuickCard icon="🚦" label="Learning Center" color="#FDF2E9" onPress={() => navigation.navigate('LearningCenter')} />
      </View>
    </ScrollView>
  );
}

function QuickCard({ icon, label, color, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={[styles.cardIconWrap, { backgroundColor: color }]}>
        <Text style={styles.cardIcon}>{icon}</Text>
      </View>
      <Text style={styles.cardLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primaryDark, paddingTop: 54, paddingBottom: 20, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bellWrapper: { position: 'relative' },
  bellIcon: { fontSize: 18 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  logoutButton: { color: '#FFFFFF', fontSize: 13, backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  welcome: { color: '#E8F0E9', fontSize: 13, marginTop: 16 },
  name: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginTop: 2 },
  verifyBanner: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, alignSelf: 'flex-start' },
  verifyBannerText: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  verifiedLine: { color: '#A7F3D0', fontSize: 12, fontWeight: '700', marginTop: 4 },
  statusCard: {
    backgroundColor: colors.card,
    marginHorizontal: 20,
    marginTop: -14,
    borderRadius: 14,
    padding: 18,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { fontSize: 22 },
  statusLabel: { fontSize: 12, color: colors.textSecondary },
  statusValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  statusWarning: { backgroundColor: '#FEF9E7', borderRadius: 8, padding: 10, marginTop: 12 },
  statusWarningText: { fontSize: 12, color: '#92650B' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 24, marginLeft: 20, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingBottom: 30 },
  card: {
    width: '44%',
    margin: '3%',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
  },
  cardIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cardIcon: { fontSize: 20 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
});
