/**
 * Approved chat knowledge — Phase 1 RAG corpus.
 *
 * Every passage below is transcribed 1:1 from the pre-RAG keyword FAQ in
 * chatbotController.js (same answers, same wording). NOTHING here is new
 * legal content: there are no external traffic laws, ordinances, or CTMO
 * policies in this file because none are available or authorized yet.
 *
 * Future-document ingestion path (NOT built — proposed separately per the
 * Phase 1 approval): move these rows into `chat_documents` (+`chat_chunks`)
 * tables with { title, authority, sourceUrl, docType, publishedAt,
 * version, indexedAt, approvalStatus, locator } and an admin approval step.
 * retrievalService.js already consumes this exact passage shape, so the only
 * change is the loader (repository reads DB instead of this module).
 *
 * Topics follow the approved RAG categories; they describe each passage so
 * future classifiers/filters have something to read. They do not decide
 * answers today — scoring does (see retrievalService.js).
 */

const PASSAGES = [
  {
    id: 'faq-settle',
    docId: 'ctmo-driver-faq',
    title: 'Settling violations',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: settle / pay',
    topics: ['citation', 'payment'],
    keywords: ['settle', 'pay', 'payment', 'bayad'],
    text: 'You can settle violations at the CTMO office (Cordova Municipal Hall, Mon–Fri 8AM–5PM) — bring your citation number. Open "My Violations" to see amounts and due dates, then tap a citation for details.',
  },
  {
    id: 'faq-office',
    docId: 'ctmo-driver-faq',
    title: 'CTMO office location and hours',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: office / where',
    topics: ['office'],
    keywords: ['office', 'address', 'location', 'where', 'saan', 'asa'],
    text: 'The CTMO office is located at Cordova Municipal Hall, Cordova, Cebu. Office hours are Monday to Friday, 8:00 AM to 5:00 PM.',
  },
  {
    id: 'faq-penalty',
    docId: 'ctmo-driver-faq',
    title: 'Penalty amounts',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: penalty / fine',
    topics: ['penalty'],
    keywords: ['penalt', 'fine', 'fee', 'cost', 'how much', 'multa'],
    text: 'Penalty amounts vary by violation type. You can see the exact fine for each of your citations under "My Violations" in the app.',
  },
  {
    id: 'faq-appeal',
    docId: 'ctmo-driver-faq',
    title: 'Appealing a citation',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: appeal / protest',
    topics: ['citation'],
    keywords: ['appeal', 'protest', 'contest', 'dispute', 'reklamo'],
    text: 'If you wish to appeal a citation, please visit the CTMO office in person within 15 days of issuance and bring a valid ID along with your citation number.',
  },
  {
    id: 'faq-warning',
    docId: 'ctmo-driver-faq',
    title: 'Warnings',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: warning',
    topics: ['citation'],
    keywords: ['warning'],
    text: 'A warning is a formal notice for a minor violation. It does not carry a fine but is recorded on your driving history.',
  },
  {
    id: 'faq-overdue',
    docId: 'ctmo-driver-faq',
    title: 'Overdue citations',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: overdue / due',
    topics: ['citation', 'payment'],
    keywords: ['overdue', 'late', 'due'],
    text: 'Citations not settled by their due date are marked overdue and may carry additional penalties per CTMO policy. Please settle as soon as possible to avoid this.',
  },
  {
    id: 'faq-license',
    docId: 'ctmo-driver-faq',
    title: 'License verification',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: license / verification',
    topics: ['account'],
    keywords: ['license', 'lisensya', 'verify', 'verified', 'verification'],
    text: 'New accounts stay Pending until an admin verifies your license photo. You can still log in, but full access unlocks after verification — usually within 1–2 working days.',
  },
  {
    id: 'faq-hello',
    docId: 'ctmo-driver-faq',
    title: 'Greeting',
    authority: 'CTMO',
    docType: 'faq',
    locator: 'FAQ: greeting',
    topics: ['general'],
    keywords: ['hello', 'hi', 'hey', 'kumusta', 'good morning', 'good afternoon'],
    text: 'Hello! I can help with settling violations, office location, penalties, appeals, warnings, and account verification. What do you need?',
  },
];

function listPassages() {
  return PASSAGES;
}

module.exports = { listPassages };
