import { keepOnlyRealEvidence } from './corpus.js';
import { retrieve, passagesForPrompt } from './retrieve.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Free-form questions run on the interactive model, for the same reason the
// conversation does: Groq meters tokens per model per day, and a corpus rebuild
// must not be able to starve the live demo (lib/converse.js).
const MODEL = process.env.GROQ_ASK_MODEL || process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b';

/**
 * Answers a question that is NOT one of the 66.
 *
 * The questionnaire is the deliverable, but it is not the boundary of what the
 * corpus knows. A reviewer reading the completed document will ask things the
 * workbook never thought to ask — "who has admin?", "is the DR plan even
 * yours?" — and the honest answer is in the documents either way.
 *
 * The discipline is identical to lib/assess.js and it is not relaxed here:
 * every quote is checked verbatim against the corpus, and an answer whose
 * evidence does not survive that check is not returned. A free-form question is
 * the EASIEST place to start quietly making things up, so it gets the strictest
 * treatment, not the loosest.
 */
const SYSTEM = `You are a security analyst answering a question about Regodit, using only the
passages given to you from Regodit's own documents. You never guess.

EVIDENCE TYPES — this distinction is the job:
- "observed"  REALITY: a scan or pentest finding, an access-review record, an asset
              register, a log. What is actually true of the running system.
- "attested"  INTENT: a policy, a plan, a handbook, an auditor's opinion. What somebody
              wrote down.
A policy saying a control is mandatory is NOT evidence that the control is switched on.
If every passage you have is attested, say so plainly in your answer: the documents state
the intent, and you have no observed proof either way.

STATUS:
- "answered"  the passages answer it, and you can quote the line that does
- "partial"   the passages bear on it but leave a specific detail open
- "conflict"  the passages disagree with each other, or an observed finding undercuts a
              policy claim. Report this rather than picking a side. The human rules.
- "absent"    nothing in these passages answers it. This is a perfectly good answer.

Do NOT answer from general knowledge about security, about vendors, or about what a
company like this usually does. You have no knowledge of Regodit except these passages.
If they do not cover it, the status is "absent" and you say so.

QUOTES — the hard rule:
Every quote MUST be copied CHARACTER FOR CHARACTER from a passage above. Never paraphrase,
tidy, join or shorten. If you cannot copy an exact sentence, you have no evidence: use
"absent" with evidence []. Use the docId shown with the passage.

Reply with JSON only:
{
  "status": "answered" | "partial" | "conflict" | "absent",
  "answer": "two or three sentences, plain and direct, addressed to the person asking",
  "confidence": 0.0-1.0,
  "evidence": [{"docId":"...","quote":"verbatim","evidenceType":"observed"|"attested"}],
  "followUpQuestion": "the specific detail still missing, or null"
}`;

/** Passages are numbered [1], [2]… and models cite the number as readily as the
 *  docId. Both are fair readings of the format (lib/assess.js). */
function remap(items, indexMap) {
  return (items ?? []).map((e) => {
    const asIndex = indexMap[String(e.docId).trim()];
    return asIndex ? { ...e, docId: asIndex } : e;
  });
}

const NOTHING_FOUND =
  'I could not find anything in Regodit’s documents that answers that. ' +
  'I am not going to guess at it — if you can tell me, I will record it as your answer.';

/**
 * A tool failure must never be dressed up as an evidence-based refusal.
 *
 * These two outcomes look identical to a reader and mean opposite things:
 * "your documents do not cover this" is a finding about the corpus, and
 * "I could not check" is a finding about us. Collapsing them would make the
 * product quietly lie in exactly the situation it exists to prevent — and on
 * an 8000-token/minute free tier, the rate limit makes it a demo-day
 * certainty, not a theoretical risk.
 */
const COULD_NOT_CHECK =
  'I could not reach the analysis model just then, so I have not checked your documents ' +
  'for this — that is a failure on my side, not an answer about your evidence. Ask me again.';

export async function askCorpus(question, { limit = 16, charBudget = 6500, retried = false } = {}) {
  const key = process.env.GROQ_API_KEY;
  const found = retrieve(question, { limit, charBudget });

  // Retrieval found nothing worth reading. No model call needed to know that.
  if (!found.length) {
    return {
      status: 'unknown', answer: NOTHING_FOUND, confidence: 0,
      evidence: [], rejectedEvidence: [], followUpQuestion: question,
      retrievedFrom: [], latencyMs: 0, usage: null, model: MODEL, error: null,
    };
  }
  if (!key) {
    return {
      status: 'error', answer: COULD_NOT_CHECK, confidence: 0,
      evidence: [], rejectedEvidence: [], followUpQuestion: question,
      retrievedFrom: [...new Set(found.map((p) => p.docId))],
      latencyMs: 0, usage: null, model: MODEL, error: 'GROQ_API_KEY is not set',
    };
  }

  const user = `THE QUESTION: ${question}

PASSAGES FROM REGODIT'S DOCUMENTS:
${passagesForPrompt(found)}`;

  const started = Date.now();
  let raw = null;
  let usage = null;
  let error = null;

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        // gpt-oss reasons before it writes; a tight budget returns an empty
        // string and silently degrades the answer (lib/converse.js).
        max_tokens: 2500,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }),
    });
    // Free tier is 8000 tokens/minute. Wait for the window the header names
    // rather than reporting a rate limit as an absence of evidence (assess.js).
    if (res.status === 429 && !retried) {
      const wait = Number(res.headers.get('retry-after')) || 8;
      await new Promise((r) => setTimeout(r, Math.min(wait + 1, 12) * 1000));
      return askCorpus(question, { limit, charBudget, retried: true });
    }
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    usage = json.usage ?? null;
    const content = json.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('empty content');
    raw = JSON.parse(content);
  } catch (err) {
    error = String(err.message ?? err).slice(0, 300);
  }

  const indexMap = Object.fromEntries(found.map((p, i) => [String(i + 1), p.docId]));
  const { kept, rejected } = keepOnlyRealEvidence(remap(raw?.evidence, indexMap));

  // Hard rule 2, unchanged: no citation, no answer. The model proposes; we
  // dispose. An unsupported answer is discarded, not shown with a caveat.
  let status = raw?.status ?? 'absent';
  let answer = raw?.answer ?? null;
  if (error) {
    // We never got a usable reading. Say that, and say nothing about the corpus.
    status = 'error';
    answer = COULD_NOT_CHECK;
  } else if (!kept.length) {
    status = 'absent';
    answer = NOTHING_FOUND;
  }

  const STATE = {
    answered: 'verified', partial: 'partial', conflict: 'conflict',
    absent: 'unknown', error: 'error',
  };

  return {
    status: STATE[status] ?? 'unknown',
    answer,
    confidence: kept.length ? Number(raw?.confidence ?? 0.5) : 0,
    evidence: kept,
    rejectedEvidence: rejected,
    followUpQuestion: error ? null : kept.length ? raw?.followUpQuestion ?? null : question,
    retrievedFrom: [...new Set(found.map((p) => p.docId))],
    latencyMs: Date.now() - started,
    usage,
    model: MODEL,
    error,
  };
}
