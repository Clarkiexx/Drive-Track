import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { fetchViolation } from '../api/citationApi';
import { createCheckout } from '../api/paymentApi';
import { getMediaUrl } from '../config';
import colors from '../theme/colors';

export default function ViolationDetailScreen({ navigation, route }) {
  const { citationId } = route.params;
  const [citation, setCitation] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [sessionOpened, setSessionOpened] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    setErrorMessage('');
    fetchViolation(citationId)
      .then((res) => setCitation(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load this record.'))
      .finally(() => setIsLoading(false));
  }, [citationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePayNow() {
    if (isPaying) return;
    setIsPaying(true);
    setPayError('');
    try {
      const res = await createCheckout(citationId);
      const checkoutUrl = res.data?.data?.checkoutUrl;
      if (!checkoutUrl) throw new Error('No checkout URL returned.');
      // Hosted Xendit checkout. Returning/dismissing never settles —
      // settlement comes only from the verified server webhook.
      await WebBrowser.openBrowserAsync(checkoutUrl);
      setSessionOpened(true);
    } catch (err) {
      setPayError(err.response?.data?.message || err.message || 'Unable to start payment.');
    } finally {
      setIsPaying(false);
      load();
    }
  }

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Citation Receipt</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.citationNumber}>{citation.citationNumber}</Text>

          <View style={styles.violationsBox}>
            <Text style={styles.violationsLabel}>Violations</Text>
            {(citation.violations || []).map((v) => (
              <Text key={v.id} style={styles.violationLine}>
                • {v.violationType?.description}
              </Text>
            ))}
            {citation.otherViolation ? <Text style={styles.violationLine}>• {citation.otherViolation}</Text> : null}
          </View>

          {citation.recordType !== 'warning' && (
            <View style={styles.fineBox}>
              <Text style={styles.fineLabel}>Total Fine</Text>
              <Text style={styles.fineAmount}>₱{Number(citation.fineAmount).toLocaleString()}</Text>
              <Text style={styles.fineStatus}>
                {citation.settlementStatus === 'settled' ? '✅ Settled' : citation.settlementStatus === 'cancelled' ? 'Cancelled' : '⚠️ Unsettled'}
              </Text>
              {citation.settlementStatus === 'pending' && citation.dueDate ? (
                <DueDateText dueDate={citation.dueDate} />
              ) : null}
              {citation.settlementStatus === 'settled' && citation.paymentMethod ? (
                <Text style={styles.paidViaText}>
                  Paid via {citation.paymentMethod}
                  {citation.paymentReference ? ` • ${citation.paymentReference}` : ''}
                </Text>
              ) : null}
              {citation.settlementStatus === 'pending' && (
                <TouchableOpacity
                  style={[styles.payButton, isPaying && styles.payButtonDisabled]}
                  onPress={handlePayNow}
                  disabled={isPaying}
                >
                  <Text style={styles.payButtonText}>{isPaying ? 'Starting payment…' : '💳 Pay Now'}</Text>
                </TouchableOpacity>
              )}
              {payError ? <Text style={styles.payErrorText}>{payError}</Text> : null}
              {sessionOpened && citation.settlementStatus === 'pending' && !isPaying && !payError ? (
                <View style={styles.awaitingBox}>
                  <Text style={styles.awaitingText}>
                    Payment submitted — awaiting confirmation. Bank transfers may take a while.
                  </Text>
                  <TouchableOpacity onPress={load}>
                    <Text style={styles.refreshText}>↻ Refresh status</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          <InfoRow label="Date & Time" value={new Date(citation.occurredAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} />
          <InfoRow label="Location" value={citation.placeOfViolation} />
          {citation.plateNumber ? <InfoRow label="Plate Number" value={citation.plateNumber} /> : null}
          {citation.vehicleUnitType ? <InfoRow label="Vehicle Unit" value={citation.vehicleUnitType} /> : null}
          {citation.registeredOwner ? <InfoRow label="Registered Owner" value={citation.registeredOwner} /> : null}
          <InfoRow label="Issued By" value={`Officer ${citation.Enforcer?.firstName} ${citation.Enforcer?.lastName}`} />

          {citation.evidence && citation.evidence.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>Photo Evidence</Text>
              <View style={styles.photoRow}>
                {citation.evidence.map((ev) => (
                  <Image
                    key={ev.evidenceId}
                    source={{ uri: getMediaUrl(ev.imagePath) }}
                    style={styles.photoThumb}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function DueDateText({ dueDate }) {
  const daysLeft = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
  const formatted = new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (daysLeft < 0) {
    return <Text style={styles.overdueText}>⏰ Overdue — was due {formatted}</Text>;
  }
  if (daysLeft === 0) {
    return <Text style={styles.dueSoonText}>⏰ Due today</Text>;
  }
  return (
    <Text style={daysLeft <= 3 ? styles.dueSoonText : styles.dueNormalText}>
      ⏰ Due {formatted} ({daysLeft} day{daysLeft !== 1 ? 's' : ''} left)
    </Text>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  card: { backgroundColor: colors.card, margin: 20, borderRadius: 14, padding: 20 },
  citationNumber: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 },
  violationsBox: { backgroundColor: '#FDECEC', borderRadius: 10, padding: 14, marginBottom: 14 },
  violationsLabel: { fontSize: 12, fontWeight: '700', color: colors.danger, marginBottom: 6 },
  violationLine: { fontSize: 13, color: colors.danger, marginBottom: 2 },
  fineBox: { backgroundColor: '#EAF4EB', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 14 },
  fineLabel: { fontSize: 12, color: colors.textSecondary },
  fineAmount: { fontSize: 22, fontWeight: '700', color: colors.primaryDark },
  fineStatus: { fontSize: 12, fontWeight: '600', marginTop: 4, color: colors.textPrimary },
  paidViaText: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  payButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 12, width: '100%', alignItems: 'center' },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  payErrorText: { fontSize: 12, color: colors.danger, marginTop: 8, textAlign: 'center' },
  awaitingBox: { marginTop: 10, alignItems: 'center' },
  awaitingText: { fontSize: 12, color: colors.warning, fontWeight: '600', textAlign: 'center' },
  refreshText: { fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: 6 },
  dueNormalText: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  dueSoonText: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: 6 },
  overdueText: { fontSize: 12, color: colors.danger, fontWeight: '700', marginTop: 6 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 10, marginBottom: 6 },
  infoRow: { marginBottom: 12 },
  infoLabel: { fontSize: 11, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoThumb: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#eee' },
});
