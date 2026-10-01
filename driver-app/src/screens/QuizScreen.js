import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import SignShape from '../components/SignShape';
import { quizQuestions, trafficSigns } from '../data/trafficSigns';
import colors from '../theme/colors';

function shuffledQuestions() {
  return [...quizQuestions].sort(() => Math.random() - 0.5);
}

export default function QuizScreen({ navigation }) {
  const [questions] = useState(shuffledQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const currentQuestion = questions[currentIndex];
  const sign = trafficSigns.find((s) => s.id === currentQuestion?.signId);

  function handleSelectOption(index) {
    if (hasAnswered) return;
    setSelectedOption(index);
    setHasAnswered(true);
    if (index === currentQuestion.correctIndex) {
      setScore((s) => s + 1);
    }
  }

  function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      setIsFinished(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    setSelectedOption(null);
    setHasAnswered(false);
  }

  function handleRestart() {
    setCurrentIndex(0);
    setSelectedOption(null);
    setHasAnswered(false);
    setScore(0);
    setIsFinished(false);
  }

  if (isFinished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quiz Results</Text>
        </View>
        <View style={styles.resultCard}>
          <Text style={styles.resultEmoji}>{pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '📚'}</Text>
          <Text style={styles.resultScore}>{score} / {questions.length}</Text>
          <Text style={styles.resultPct}>{pct}% Correct</Text>
          <Text style={styles.resultMessage}>
            {pct >= 80
              ? "Excellent! You know your road signs well."
              : pct >= 50
              ? 'Good effort — review the signs you missed in the Learning Center.'
              : 'Keep practicing! Review the Learning Center and try again.'}
          </Text>
          <TouchableOpacity style={styles.retakeButton} onPress={handleRestart}>
            <Text style={styles.retakeButtonText}>Retake Quiz</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
            <Text style={styles.backLink}>← Back to Learning Center</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sign Quiz</Text>
      </View>

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>Question {currentIndex + 1} of {questions.length}</Text>
        <Text style={styles.progressText}>Score: {score}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.signPreview}>
          <SignShape shape={sign?.shape} color={sign?.color} size={64} />
        </View>

        <Text style={styles.questionText}>{currentQuestion.question}</Text>

        {currentQuestion.options.map((option, index) => {
          let optionStyle = styles.option;
          if (hasAnswered) {
            if (index === currentQuestion.correctIndex) {
              optionStyle = styles.optionCorrect;
            } else if (index === selectedOption) {
              optionStyle = styles.optionIncorrect;
            }
          }
          return (
            <TouchableOpacity key={index} style={optionStyle} onPress={() => handleSelectOption(index)}>
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          );
        })}

        {hasAnswered && (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>
              {currentIndex + 1 >= questions.length ? 'See Results →' : 'Next Question →'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 14 },
  progressText: { fontSize: 12, color: colors.textSecondary },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginHorizontal: 20, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary },
  signPreview: { alignItems: 'center', justifyContent: 'center', height: 90, marginBottom: 16 },
  questionText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 16, textAlign: 'center' },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  optionCorrect: {
    borderWidth: 1,
    borderColor: '#16A34A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#DCFCE7',
  },
  optionIncorrect: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FDECEC',
  },
  optionText: { fontSize: 14, color: colors.textPrimary },
  nextButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  nextButtonText: { color: '#FFFFFF', fontWeight: '700' },
  resultCard: { backgroundColor: colors.card, margin: 20, borderRadius: 16, padding: 30, alignItems: 'center' },
  resultEmoji: { fontSize: 40, marginBottom: 10 },
  resultScore: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  resultPct: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 16 },
  resultMessage: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  retakeButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 30 },
  retakeButtonText: { color: '#FFFFFF', fontWeight: '700' },
  backLink: { color: colors.primary, fontWeight: '600' },
});
