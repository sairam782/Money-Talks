import { keepOnlyRealEvidence } from './corpus.js';
import { retrieve, passagesForPrompt } from './retrieve.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SYSTEM = `You are a security auditor completing a vendor security questionnaire about
Regodit, using only Regodit's own documents. You are rigorous and you never guess.

EVIDENCE TYPES — this distinction is the entire job:
- "observed"  REALITY: a scan or pentest finding, an access-review record, an asset
              register, a log. What is actually true of the running system.
- "attested"  INTENT: a policy, a plan, a handbook, an auditor's opinion. What somebody
              wrote down.
A policy saying a control is mandatory is NOT evidence the control is switched on.

MANDATORY FIRST STEP. Before choosing any status, fill in "observedCheck": state what the
observed passages show about this control, or "none present". Do this honestly. You may
not answer "answered" on attested evidence alone while observed passages about the same
control sit unaddressed in front of you. That is the single most common way this task is
failed.

THESE PATTERNS ARE CONFLICTS. Do not report them as "answered":
- A pentest, VAPT or audit RECOMMENDS implementing a control, while a policy claims that
  control is already enforced. Nobody recommends enabling what is already enforced. The
  recommendation is evidence the control is absent or partial.
- A finding reports a control missing or weak, while a policy claims it is in place.
- A review record shows a required action ("Revoke access", "Change access", justified =
  "N", an exception, an overdue item) that is not marked complete, while a policy claims
  the control is enforced.
- Two observed records disagree about the same fact, system or person.
- A document's own provenance undercuts it: it names a different company, or the assessor
  is the assessed party.
Report the conflict even if most sources agree. Weight observed over attested. The human rules.

THE FOUR STATES:
- "answered"  fully answered, with a quotable line, and no observed evidence contradicts it
- "partial"   bears on it but a specific detail is missing
- "conflict"  sources disagree, or a claim is contradicted or undercut by reality
- "absent"    nothing in the passages bears on it

QUOTES — the hard rule:
Every quote MUST be copied CHARACTER FOR CHARACTER from the passage text given to you.
Never paraphrase, tidy, join or shorten. If you cannot copy an exact sentence you have no
evidence: use "absent" with evidence []. Use only the docId values shown.

You will be given several questions covering one topic, and one shared set of passages.
Answer EVERY question. Reply with JSON only:
{
  "answers": [
    {
      "id": "q60",
      "observedCheck": "what the observed passages show, or 'none present'",
      "status": "answered" | "partial" | "conflict" | "absent",
      "value": "one or two sentences, or null",
      "confidence": 0.0-1.0,
      "evidence": [{"docId":"...","quote":"verbatim","evidenceType":"observed"|"attested"}],
      "followUpQuestion": "the specific missing detail, or null",
      "conflict": null | {
        "nature": "policy_vs_observed_exception" | "observed_vs_observed" |
                  "stale_remediation" | "provenance",
        "sources": [{"docId":"...","quote":"verbatim"}],
        "proposedQuestion": "what to ask the human so they can rule"
      }
    }
  ]
}`;

async function callGroq(messages, { temperature = 0, maxTokens = 1200 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');

  const started = Date.now();
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });

  if (res.status === 429) {
    // Free tier is 8000 tokens/minute. Wait for the window the header names,
    // rather than hammering a limit we already know we hit.
    const wait = Number(res.headers.get('retry-after')) || 20;
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    return callGroq(messages, { temperature, maxTokens, _retry: true });
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  return {
    content: json.choices?.[0]?.message?.content ?? '',
    latencyMs: Date.now() - started,
    usage: json.usage ?? null,
  };
}

/**
 * Passages are numbered [1], [2]... in the prompt, and models cite the number
 * as readily as the docId. Both are legitimate readings of the format, so we
 * accept either and resolve the number back to the document it came from.
 */
function remap(items, indexMap) {
  return (items ?? []).map((e) => {
    const asIndex = indexMap[String(e.docId).trim()];
    return asIndex ? { ...e, docId: asIndex } : e;
  });
}

/** Normalises one model answer into a profile entry, dropping unsupported claims. */
function normaliseAnswer(raw, question, indexMap = {}) {
  const { kept, rejected } = keepOnlyRealEvidence(remap(raw.evidence, indexMap));

  let status = raw.status;
  let value = raw.value ?? null;
  let followUpQuestion = raw.followUpQuestion ?? null;

  // Hard rule 2: no citation, no answer. The model proposes; we dispose.
  if ((status === 'answered' || status === 'partial') && kept.length === 0) {
    status = 'absent';
    value = null;
    followUpQuestion =
      followUpQuestion ??
      `Not evidenced in your documents — can you confirm? ${question.text}`;
  }

  // A conflict is only real if both sides survive quote validation.
  let conflict = null;
  if (raw.conflict && Array.isArray(raw.conflict.sources)) {
    const { kept: sides } = keepOnlyRealEvidence(remap(raw.conflict.sources, indexMap));
    const distinct = [...new Map(sides.map((s) => [s.docId + s.quote, s])).values()];
    if (distinct.length >= 2) conflict = { ...raw.conflict, sources: distinct };
  }
  if (status === 'conflict' && !conflict) status = kept.length ? 'partial' : 'absent';

  const STATE = { answered: 'verified', partial: 'partial', conflict: 'conflict', absent: 'unknown' };

  return {
    questionId: question.id,
    num: question.num,
    topic: question.topic,
    questionText: question.text,
    status: STATE[status] ?? 'unknown',
    value,
    confidence: kept.length ? Number(raw.confidence ?? 0.5) : 0,
    observedCheck: raw.observedCheck ?? null,
    evidence: kept,
    rejectedEvidence: rejected,
    followUpQuestion,
    conflict,
  };
}

/**
 * Assess every question in one topic with a single model call.
 *
 * Batching is forced by Groq's free tier — 8000 tokens/minute and 200k/day make
 * 66 individual calls impossible (PLAN.md §2). It also assesses better: the
 * model sees a whole control area at once, so a policy claim and the finding
 * that undercuts it are weighed together instead of in separate calls.
 */
export async function assessTopic(topic, questions, { charBudget = 9000 } = {}) {
  // Retrieve against every question in the topic, so the shared passage set
  // covers the whole control area.
  const probe = questions.map((q) => q.text).join(' ');
  const found = retrieve(probe, { limit: 30, charBudget });

  const questionList = questions
    .map((q) => `${q.id} (${q.num}): ${q.malformed ? '[BLANK IN SOURCE WORKBOOK]' : q.text}`)
    .join('\n');

  const user = `TOPIC: ${topic}

QUESTIONS — answer every one, using the id given:
${questionList}

PASSAGES FROM REGODIT'S DOCUMENTS:
${passagesForPrompt(found)}`;

  const started = Date.now();
  let parsed;
  let usage = null;
  let error = null;
  try {
    const out = await callGroq(
      [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      { maxTokens: 4000 }
    );
    parsed = JSON.parse(out.content);
    usage = out.usage;
    if (process.env.ASSESS_DEBUG) {
      const fs = await import('fs');
      fs.writeFileSync(`/tmp/assess-${topic.replace(/\W+/g,'_')}.json`, out.content);
    }
  } catch (err) {
    error = String(err.message ?? err).slice(0, 300);
  }

  const byId = Object.fromEntries((parsed?.answers ?? []).map((a) => [a.id, a]));
  const indexMap = Object.fromEntries(found.map((p, i) => [String(i + 1), p.docId]));

  return {
    topic,
    latencyMs: Date.now() - started,
    usage,
    error,
    retrievedFrom: [...new Set(found.map((p) => p.docId))],
    answers: questions.map((q) =>
      byId[q.id]
        ? normaliseAnswer(byId[q.id], q, indexMap)
        : {
            questionId: q.id, num: q.num, topic: q.topic, questionText: q.text,
            status: 'unknown', value: null, confidence: 0, evidence: [],
            rejectedEvidence: [], observedCheck: null,
            followUpQuestion: error
              ? null
              : `We could not evidence this from your documents. Can you confirm: ${q.text}`,
            conflict: null, error,
          }
    ),
  };
}
