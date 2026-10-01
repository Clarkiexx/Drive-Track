import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Share } from 'react-native';
import { getMediaUrl } from '../config';
import colors from '../theme/colors';

export default function CitationSuccessScreen({ navigation, route }) {
  const { citation } = route.params;
  const isWarning = citation.recordType === 'warning';

  const violationLines = (citation.violations || []).map(
    (v) => v.violationType?.description
  );

  async function handleShare() {
    try {
      await Share.share({
        message: `DriveTrack ${isWarning ? 'Warning' : 'Citation'} ${citation.citationNumber}\nDriver: ${citation.Driver?.firstName} ${citation.Driver?.lastName}\nViolations: ${violationLines.join(', ')}${isWarning ? '' : `\nFine: ₱${Number(citation.fineAmount).toLocaleString()}`}`,
      });
    } catch {
      // sharing cancelled or failed silently — not critical to the flow
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>{isWarning ? '🔶' : '⚠️'}</Text>
        <Text style={styles.title}>{isWarning ? 'WARNING ISSUED' : 'CITATION ISSUED'}</Text>

        <Text style={styles.fieldLabel}>{isWarning ? 'Warning Number' : 'Citation Number'}</Text>
        <Text style={styles.citationNumber}>{citation.citationNumber}</Text>

        <View style={styles.divider} />

        <InfoRow icon="👤" label="Driver Name" value={`${citation.Driver?.firstName} ${citation.Driver?.lastName}`} />
        <InfoRow icon="👤" label="License Number" value={citation.Driver?.licenseNumber} />

        <View style={styles.violationsBox}>
          <Text style={styles.violationsLabel}>Violations</Text>
          {violationLines.map((line, i) => (
            <Text key={i} style={styles.violationLine}>
              • {line}
            </Text>
          ))}
          {citation.otherViolation ? <Text style={styles.violationLine}>• {citation.otherViolation}</Text> : null}
        </View>

        {!isWarning && (
          <View style={styles.fineBox}>
            <Text style={styles.fineLabel}>Total Fine</Text>
            <Text style={styles.fineAmount}>₱{Number(citation.fineAmount).toLocaleString()}</Text>
          </View>
        )}

        <InfoRow
          icon="📅"
          label="Date & Time"
          value={new Date(citation.occurredAt).toLocaleString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        />
        <InfoRow icon="📍" label="Location" value={citation.placeOfViolation} />
        {citation.plateNumber ? <InfoRow icon="🚗" label="Plate Number" value={citation.plateNumber} /> : null}
        {citation.vehicleUnitType ? <InfoRow icon="🚗" label="Vehicle Unit" value={citation.vehicleUnitType} /> : null}
        {citation.registeredOwner ? <InfoRow icon="🚗" label="Registered Owner" value={citation.registeredOwner} /> : null}

        <View style={styles.divider} />

        <Text style={styles.fieldLabel}>Issued By</Text>
        <Text style={styles.issuedBy}>
          Officer {citation.Enforcer?.firstName} {citation.Enforcer?.lastName}
        </Text>
        <Text style={styles.issuedBySub}>
          Badge #{citation.Enforcer?.badgeNumber || '—'} • {citation.Enforcer?.station}
        </Text>

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

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>🔗 Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dashboardButton}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
        >
          <Text style={styles.dashboardButtonText}>🏠 Dashboard</Text>
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

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.background, padding: 20, paddingTop: 50 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: 'center' },
  badge: { fontSize: 26, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '700', color: colors.primaryDark, letterSpacing: 1 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-start', marginTop: 18 },
  citationNumber: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, alignSelf: 'flex-start' },
  divider: { height: 1, backgroundColor: colors.border, width: '100%', marginVertical: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 12 },
  infoIcon: { fontSize: 16, marginRight: 10 },
  infoLabel: { fontSize: 11, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  violationsBox: {
    backgroundColor: '#FDECEC',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    marginTop: 8,
    marginBottom: 12,
  },
  violationsLabel: { fontSize: 12, fontWeight: '700', color: colors.danger, marginBottom: 6 },
  violationLine: { fontSize: 13, color: colors.danger, marginBottom: 2 },
  fineBox: {
    backgroundColor: '#EAF4EB',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  fineLabel: { fontSize: 12, color: colors.textSecondary },
  fineAmount: { fontSize: 22, fontWeight: '700', color: colors.primaryDark },
  issuedBy: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, alignSelf: 'flex-start' },
  issuedBySub: { fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-start' },
  photoRow: { flexDirection: 'row', gap: 10, alignSelf: 'flex-start', marginTop: 8 },
  photoThumb: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#eee' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  shareButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  shareButtonText: { color: colors.textPrimary, fontWeight: '600' },
  dashboardButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dashboardButtonText: { color: '#FFFFFF', fontWeight: '600' },
});
