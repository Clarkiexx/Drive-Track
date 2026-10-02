import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMyNotifications, markNotificationRead, markAllNotificationsRead } from '../api/notificationApi';
import colors from '../theme/colors';

const TYPE_ICON = {
  citation_issued: { icon: '⚠️', bg: '#FDECEC' },
  warning_issued: { icon: '🔶', bg: '#FEF3C7' },
  payment_reminder: { icon: '🔔', bg: '#FEF3C7' },
  settlement_confirmed: { icon: 'ℹ️', bg: '#E7F0FE' },
  follow_up: { icon: '🔔', bg: '#FEF3C7' },
  announcement: { icon: '📢', bg: '#E7F0FE' },
  system_alert: { icon: '⚠️', bg: '#FDECEC' },
};

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    setIsLoading(true);
    fetchMyNotifications()
      .then((res) => setNotifications(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load notifications.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A settlement_confirmed notification lands via webhook while the driver
  // may be elsewhere — refresh on focus so it appears without reload.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'read' })));
    } catch {
      // Non-critical — user can retry by tapping again.
    }
  }

  async function handleTapNotification(notification) {
    if (notification.status === 'unread') {
      try {
        await markNotificationRead(notification.notificationId);
        setNotifications((prev) =>
          prev.map((n) => (n.notificationId === notification.notificationId ? { ...n, status: 'read' } : n))
        );
      } catch {
        // Non-critical.
      }
    }
    if (notification.citationId) {
      navigation.navigate('ViolationDetail', { citationId: notification.citationId });
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.unreadText}>{unreadCount} Unread</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.notificationId)}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No notifications yet.</Text>}
          renderItem={({ item }) => {
            const style = TYPE_ICON[item.notificationType] || TYPE_ICON.system_alert;
            return (
              <TouchableOpacity style={styles.card} onPress={() => handleTapNotification(item)}>
                <View style={[styles.iconBox, { backgroundColor: style.bg }]}>
                  <Text>{style.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.message}>{item.message}</Text>
                  <Text style={styles.timeAgo}>
                    {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                {item.status === 'unread' && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
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
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  unreadText: { fontSize: 12, color: colors.textSecondary },
  markAllText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  errorText: { color: colors.danger, textAlign: 'center', marginTop: 30 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 30 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  iconBox: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  message: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  timeAgo: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 4 },
});
