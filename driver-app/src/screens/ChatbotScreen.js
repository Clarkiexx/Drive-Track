import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { askChatbot } from '../api/chatbotApi';
import colors from '../theme/colors';

const INITIAL_QUICK_QUESTIONS = [
  'How to settle violations?',
  'Where is CTMO office?',
  'What are the penalties?',
  'How to appeal?',
];

let nextMessageId = 1;

export default function ChatbotScreen({ navigation }) {
  const [messages, setMessages] = useState([
    { id: 0, from: 'bot', text: "Hello! I'm DriveTrack Assistant. How can I help you today?" },
  ]);
  const [quickQuestions, setQuickQuestions] = useState(INITIAL_QUICK_QUESTIONS);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef(null);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    nextMessageId += 1;
    const userMessage = { id: nextMessageId, from: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsSending(true);

    try {
      const response = await askChatbot(trimmed);
      nextMessageId += 1;
      setMessages((prev) => [...prev, { id: nextMessageId, from: 'bot', text: response.data.data.answer }]);
      if (response.data.data.quickQuestions) {
        setQuickQuestions(response.data.data.quickQuestions);
      }
    } catch (err) {
      nextMessageId += 1;
      const serverMsg = err.response?.data?.message;
      const detail = serverMsg
        ? ` (${serverMsg})`
        : err.request && !err.response
          ? ' (cannot reach server — check Wi-Fi / EXPO_PUBLIC_API_URL)'
          : '';
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId, from: 'bot', text: `Sorry, I ran into a connection issue${detail}. Please try again.` },
      ]);
    } finally {
      setIsSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Home')}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.botIcon}>
            <Text>🤖</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>DriveTrack Assistant</Text>
            <Text style={styles.headerSubtitle}>Always here to help</Text>
          </View>
        </View>

        <View style={styles.quickQuestionsSection}>
          <Text style={styles.quickQuestionsLabel}>Quick Questions</Text>
          <View style={styles.quickQuestionsGrid}>
            {quickQuestions.map((q) => (
              <TouchableOpacity key={q} style={styles.quickQuestionChip} onPress={() => sendMessage(q)}>
                <Text style={styles.quickQuestionText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          renderItem={({ item }) =>
            item.from === 'bot' ? (
              <View style={styles.botRow}>
                <View style={styles.botAvatar}>
                  <Text style={{ fontSize: 12 }}>🤖</Text>
                </View>
                <View style={styles.botBubble}>
                  <Text style={styles.botText}>{item.text}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{item.text}</Text>
                </View>
              </View>
            )
          }
        />

        {isSending && <ActivityIndicator style={{ marginBottom: 8 }} color={colors.primary} />}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor={colors.placeholder}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => sendMessage(inputText)}
          />
          <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage(inputText)}>
            <Text style={styles.sendButtonText}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backArrow: { color: '#FFFFFF', fontSize: 20, marginRight: 4 },
  botIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: '#E8F0E9', fontSize: 11 },
  quickQuestionsSection: { backgroundColor: '#FFFFFF', padding: 16 },
  quickQuestionsLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  quickQuestionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickQuestionChip: {
    backgroundColor: '#EAF4EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickQuestionText: { fontSize: 12, color: colors.primaryDark, fontWeight: '600' },
  botRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14 },
  botAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EAF4EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    padding: 12,
    maxWidth: '78%',
  },
  botText: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  userRow: { alignItems: 'flex-end', marginBottom: 14 },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    borderBottomRightRadius: 4,
    padding: 12,
    maxWidth: '78%',
  },
  userText: { fontSize: 13, color: '#FFFFFF' },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: { color: '#FFFFFF', fontSize: 16 },
});
