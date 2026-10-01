const { success, fail } = require('../utils/response');

// Simple keyword-matched FAQ responses — deliberately not an LLM
// integration, since a rule-based matcher is simpler to build, easier to
// defend in a capstone review, and fully predictable for a fixed set of
// common questions like these.
const FAQ_RULES = [
  {
    keywords: ['settle', 'pay', 'payment', 'bayad'],
    answer:
      'You can settle violations at the CTMO office (Cordova Municipal Hall, Mon–Fri 8AM–5PM) — bring your citation number. Open "My Violations" to see amounts and due dates, then tap a citation for details.',
  },
  {
    keywords: ['office', 'address', 'location', 'where', 'saan', 'asa'],
    answer: 'The CTMO office is located at Cordova Municipal Hall, Cordova, Cebu. Office hours are Monday to Friday, 8:00 AM to 5:00 PM.',
  },
  {
    keywords: ['penalt', 'fine', 'fee', 'cost', 'how much', 'multa'],
    answer:
      'Penalty amounts vary by violation type. You can see the exact fine for each of your citations under "My Violations" in the app.',
  },
  {
    keywords: ['appeal', 'protest', 'contest', 'dispute', 'reklamo'],
    answer:
      'If you wish to appeal a citation, please visit the CTMO office in person within 15 days of issuance and bring a valid ID along with your citation number.',
  },
  {
    keywords: ['warning'],
    answer: 'A warning is a formal notice for a minor violation. It does not carry a fine but is recorded on your driving history.',
  },
  {
    keywords: ['overdue', 'late', 'due'],
    answer:
      'Citations not settled by their due date are marked overdue and may carry additional penalties per CTMO policy. Please settle as soon as possible to avoid this.',
  },
  {
    keywords: ['license', 'lisensya', 'verify', 'verified', 'verification'],
    answer:
      'New accounts stay Pending until an admin verifies your license photo. You can still log in, but full access unlocks after verification — usually within 1–2 working days.',
  },
  {
    keywords: ['hello', 'hi', 'hey', 'kumusta', 'good morning', 'good afternoon'],
    answer:
      'Hello! I can help with settling violations, office location, penalties, appeals, warnings, and account verification. What do you need?',
  },
];

const DEFAULT_ANSWER =
  "I'm not sure how to help with that specific question yet. For anything not covered here, please visit the CTMO office or call our hotline during office hours.";

const QUICK_QUESTIONS = [
  'How to settle violations?',
  'Where is CTMO office?',
  'What are the penalties?',
  'How to appeal?',
];

/** POST /chatbot/ask — { message: string } */
function ask(req, res) {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return fail(res, 'A message is required', 422);
  }

  const normalized = message.toLowerCase();
  const matched = FAQ_RULES.find((rule) => rule.keywords.some((kw) => normalized.includes(kw)));

  return success(res, {
    answer: matched ? matched.answer : DEFAULT_ANSWER,
    quickQuestions: QUICK_QUESTIONS,
  });
}

module.exports = { ask };
