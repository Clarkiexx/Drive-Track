import client from './client';

export function askChatbot(message) {
  return client.post('/chatbot/ask', { message });
}
