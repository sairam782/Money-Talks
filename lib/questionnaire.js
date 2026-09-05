import fs from 'fs';
import path from 'path';

const raw = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data', 'questions.json'), 'utf8')
);

/**
 * Q52 is blank in the workbook Regodit shipped — the cell repeats "52.0" with
 * no question text. We keep it and surface it as an honest gap rather than
 * silently dropping it: noticing a defect in the client's own questionnaire is
 * the job, and a hidden question is a question we failed to answer.
 */
export const QUESTIONS = raw.map((q) => ({
  id: q.id,
  num: q.num,
  topic: q.topic,
  text: q.text,
  malformed: Boolean(q.malformed),
}));

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

export const TOPICS = [...new Set(QUESTIONS.map((q) => q.topic))];

export const questionsByTopic = (topic) => QUESTIONS.filter((q) => q.topic === topic);

/** Groups questions into per-topic batches — one model call each (PLAN.md §2). */
export const TOPIC_BATCHES = TOPICS.map((topic) => ({
  topic,
  questions: questionsByTopic(topic),
}));

/**
 * Questions that ask the vendor to attach or send something. These can never be
 * `verified` from the corpus alone — the most we can say is that the document
 * exists and which one it is, so they always carry a follow-up.
 */
const ATTACHMENT_RE = /please (attach|provide|submit|list)|provide a copy|copy of your/i;
export const isAttachmentRequest = (q) => ATTACHMENT_RE.test(q.text);

export const stats = () => ({
  questions: QUESTIONS.length,
  topics: TOPICS.length,
  malformed: QUESTIONS.filter((q) => q.malformed).map((q) => q.id),
  attachmentRequests: QUESTIONS.filter(isAttachmentRequest).length,
});
