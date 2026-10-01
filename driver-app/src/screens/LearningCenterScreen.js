import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import SignShape from '../components/SignShape';
import { trafficSigns } from '../data/trafficSigns';
import colors from '../theme/colors';

const CATEGORIES = ['All', 'Regulatory', 'Warning', 'Informational'];

export default function LearningCenterScreen({ navigation }) {
  const [activeCategory, setActiveCategory] = useState('All');

  const filteredSigns =
    activeCategory === 'All' ? trafficSigns : trafficSigns.filter((s) => s.category === activeCategory);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Learning Center</Text>
      </View>

      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.categoryText, activeCategory === cat && styles.categoryTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {filteredSigns.map((sign) => (
          <View key={sign.id} style={styles.signCard}>
            <View style={styles.signShapeWrap}>
              <SignShape shape={sign.shape} color={sign.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.signName}>{sign.name}</Text>
              <Text style={styles.signCategory}>{sign.category}</Text>
              <Text style={styles.signMeaning}>{sign.meaning}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.quizButton} onPress={() => navigation.navigate('Quiz')}>
        <Text style={styles.quizButtonText}>📝 Take Quiz</Text>
      </TouchableOpacity>
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
  categoryRow: { flexDirection: 'row', gap: 8, padding: 16, backgroundColor: '#FFFFFF' },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: colors.background },
  categoryChipActive: { backgroundColor: colors.primary },
  categoryText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  categoryTextActive: { color: '#FFFFFF' },
  signCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signShapeWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  signName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  signCategory: { fontSize: 11, color: colors.textSecondary, marginTop: 1, marginBottom: 4 },
  signMeaning: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  quizButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  quizButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
