import fs from 'fs';
import path from 'path';
import { QUESTIONS } from './questionnaire.js';

/**
 * The profile is the whole state of the interview. The client holds it and
 * posts it up each turn; the server never stores it (ARCHITECTURE.md §3).
 */

let cached = null;
export function cachedAnswers() {
  // Only memoise a real read. Caching the empty fallback would freeze an
  // instance that started before the corpus pass finished into serving 66
  // unknowns forever.
  if (cached) return cached;
  const p = path.join(process.cwd(), 'data', 'answers.json');
  if (!fs.existsSync(p)) return { answers: [] };
  cached = JSON.parse(fs.readFileSync(p, 'utf8'));
  return cached;
}

/** Builds the starting profile from the cached corpus pass. */
export function initialProfile() {
  const { answers = [], runId = null, generatedAt = null } = cachedAnswers();
  const byId = Object.fromEntries(answers.map((a) => [a.questionId, a]));

  const entries = {};
  for (const q of QUESTIONS) {
    const a = byId[q.id];
    entries[q.id] = {
      questionId: q.id,
      num: q.num,
      topic: q.topic,
      questionText: q.text,
      status: a?.status ?? 'unknown',
      value: a?.value ?? null,
      confidence: a?.confidence ?? 0,
      evidence: a?.evidence ?? [],
      conflict: a?.conflict ?? null,
      followUps: [],
      followUpQuestion: a?.followUpQuestion ?? null,
      history: a
        ? [{ at: generatedAt, from: null, to: a.status, by: 'corpus', reason: 'initial corpus pass' }]
        : [],
    };
  }

  return {
    companyName: 'Regodit',
    runId,
    generatedAt,
    answers: entries,
    askedQuestions: [],
    openConflicts: Object.values(entries).filter((e) => e.status === 'conflict').map((e) => e.questionId),
  };
}

/**
 * Records what a human told us. Never mutates: the previous state is pushed onto
 * history so a correction keeps its provenance (ARCHITECTURE.md §2, rule 3).
 */
export function recordUserAnswer(profile, questionId, text, { resolvesConflict = false } = {}) {
  const prev = profile.answers[questionId];
  if (!prev) return { profile, action: 'unknown_question' };

  const next = {
    ...prev,
    status: 'confirmed',
    value: text,
    confidence: 0.75,
    evidence: [
      ...(resolvesConflict ? prev.evidence : []),
      { docId: null, docName: 'Told to us by the vendor', quote: text, evidenceType: 'asserted', date: new Date().toISOString().slice(0, 10) },
    ],
    conflict: resolvesConflict ? null : prev.conflict,
    history: [
      ...prev.history,
      { at: new Date().toISOString(), from: prev.status, to: 'confirmed', by: 'user', reason: resolvesConflict ? 'ruled on conflict' : 'answered gap' },
    ],
  };

  return {
    profile: {
      ...profile,
      answers: { ...profile.answers, [questionId]: next },
      askedQuestions: [...new Set([...profile.askedQuestions, questionId])],
      openConflicts: profile.openConflicts.filter((id) => !(resolvesConflict && id === questionId)),
    },
    action: resolvesConflict ? 'recorded_correction' : 'answered',
  };
}

export function coverage(profile) {
  const c = { verified: 0, confirmed: 0, partial: 0, unknown: 0, conflict: 0 };
  for (const a of Object.values(profile.answers)) c[a.status] = (c[a.status] ?? 0) + 1;
  const ev = { observed: 0, attested: 0, asserted: 0 };
  for (const a of Object.values(profile.answers))
    for (const e of a.evidence) ev[e.evidenceType] = (ev[e.evidenceType] ?? 0) + 1;
  return { states: c, evidence: ev, total: Object.keys(profile.answers).length };
}

/** The next thing worth asking a human: conflicts first, then gaps. */
export function nextOpenQuestion(profile) {
  const all = Object.values(profile.answers);
  return (
    all.find((a) => a.status === 'conflict') ??
    all.find((a) => a.status === 'unknown' && !profile.askedQuestions.includes(a.questionId)) ??
    all.find((a) => a.status === 'partial' && !profile.askedQuestions.includes(a.questionId)) ??
    null
  );
}
