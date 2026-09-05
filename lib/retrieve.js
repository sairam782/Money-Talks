import { DOCS } from './corpus.js';

/**
 * Keyword retrieval over paragraphs. No embeddings, no vector store.
 *
 * Groq's free tier is ~8K tokens/minute, so the 517k-char corpus cannot go in
 * context (PLAN.md §2). We select a few thousand characters per question
 * instead. ARCHITECTURE.md §2 permits exactly this: "only chunk if the corpus
 * genuinely doesn't fit."
 */

const STOP = new Set(`a an and are as at be by do does for from have has how in is it its of on or
that the to what when where which who will with your you our organization organizations company
please describe provide any all if so include including used use uses`.split(/\s+/));

// Vendor questionnaires and security documents rarely share vocabulary. The
// question says "MFA"; the policy says "multi-factor authentication". Without
// this the conflict is never retrieved, and the whole demo rests on it.
const SYNONYMS = {
  mfa: ['multi-factor', 'multifactor', 'two-factor', '2fa', 'authenticator', 'otp'],
  authentication: ['authentication', 'login', 'credential', 'sign-on', 'sso'],
  encryption: ['encryption', 'encrypted', 'tls', 'ssl', 'aes', 'cryptograph', 'at-rest', 'in-transit'],
  backup: ['backup', 'backups', 'restore', 'recovery', 'rpo', 'rto'],
  vulnerability: ['vulnerability', 'vulnerabilities', 'scan', 'scanning', 'patch', 'cve', 'remediation'],
  penetration: ['penetration', 'pentest', 'vapt', 'red team'],
  incident: ['incident', 'breach', 'event', 'response', 'escalation'],
  access: ['access', 'privilege', 'permission', 'role-based', 'rbac', 'least privilege'],
  review: ['review', 'reviewed', 'recertification', 'attestation', 'audit'],
  training: ['training', 'awareness', 'onboarding'],
  asset: ['asset', 'inventory', 'device', 'laptop', 'endpoint'],
  vendor: ['vendor', 'third-party', 'subcontractor', 'supplier', 'contractor'],
  privacy: ['privacy', 'pii', 'phi', 'personal data', 'retention', 'disposal'],
  network: ['network', 'firewall', 'segmentation', 'dns', 'vpn', 'wireless'],
  logging: ['logging', 'logs', 'monitoring', 'siem', 'audit trail'],
  policy: ['policy', 'standard', 'procedure', 'program'],
};

const tokenize = (s) =>
  String(s).toLowerCase().match(/[a-z][a-z0-9-]{1,}/g)?.filter((t) => !STOP.has(t)) ?? [];

function expand(terms) {
  const out = new Set(terms);
  for (const t of terms) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (t === key || syns.some((s) => s.includes(t) || t.includes(s.split(/[\s-]/)[0]))) {
        out.add(key);
        syns.forEach((s) => out.add(s));
      }
    }
  }
  return [...out];
}

/**
 * A short line is usually a heading or a stray table cell, and carries no
 * evidence. Two exceptions, and they matter more than the rule:
 *
 * "Company Name: Solsphere AI Inc" is 30 characters. It is the only line in the
 * BCP/DR plan that names its owner, and that plan is filed as Regodit's
 * evidence. Dropping every short line made the single line proving a document
 * belongs to somebody else structurally unquotable — so assess.js could name a
 * "provenance" conflict but never cite one, and no answer could ever rest on
 * whose document it is.
 *
 * So: keep a labelled identity field wherever it appears, and keep the title
 * block every document opens with.
 */
const IDENTITY_LINE =
  /^(company|client|customer|organi[sz]ation|entity|business|vendor|supplier|prepared (for|by)|approved by|author|owner|issued (to|by)|title|document)\b[^:]{0,40}:/i;
const TITLE_BLOCK_LINES = 6;

const keepShortLine = (text, i) =>
  (IDENTITY_LINE.test(text) && text.length >= 12) ||
  (i < TITLE_BLOCK_LINES && text.length >= 15);

// Paragraphs, built once at module load.
const PARAS = [];
for (const doc of DOCS) {
  doc.text.split('\n').forEach((line, i) => {
    const text = line.trim();
    if (text.length < 40 && !keepShortLine(text, i)) return;
    PARAS.push({
      docId: doc.docId,
      docName: doc.docName,
      evidenceType: doc.evidenceType,
      date: doc.date,
      idx: i,
      text,
      tokens: new Set(tokenize(text)),
    });
  });
}

/**
 * The line on which each document says whose it is.
 *
 * Keyword retrieval cannot connect "whose plan is this?" to "Company Name:
 * Solsphere AI Inc" — they share no words, and the words they do share are
 * stopwords. But provenance is not a topic the reader has to think to ask
 * about: it is a property of every passage we hand over. So whenever a
 * document contributes a passage, the line naming its owner comes with it,
 * and the model can always see — and quote — whose document it is reading.
 */
const DOC_IDENTITY = {};
for (const doc of DOCS) {
  const lines = doc.text.split('\n').map((l) => l.trim());
  const line =
    lines.find((l, i) => i < 12 && IDENTITY_LINE.test(l) && l.length >= 12) ??
    lines.find((l) => l.length >= 15);
  if (line) {
    DOC_IDENTITY[doc.docId] = {
      docId: doc.docId, docName: doc.docName, evidenceType: doc.evidenceType,
      date: doc.date, text: line, score: 0.01, identity: true,
    };
  }
}

// Inverse document frequency, so "authentication" counts for less than "delgado".
const DF = new Map();
for (const p of PARAS) for (const t of p.tokens) DF.set(t, (DF.get(t) ?? 0) + 1);
const idf = (t) => Math.log(1 + PARAS.length / (1 + (DF.get(t) ?? 0)));

/**
 * Small ground-truth records are included WHOLE, not by paragraph.
 *
 * "M. Delgado | ... | Admin | ... | N | Revoke access" is meaningless without
 * the header row that names those columns. Splitting a table into paragraphs
 * destroys the thing that makes it evidence, and these files are ~1.7k chars,
 * so there is no reason to fragment them.
 */
const WHOLE_DOC_LIMIT = 3000;
const WHOLE_DOCS = DOCS.filter(
  (d) => d.evidenceType === 'observed' && d.text.length <= WHOLE_DOC_LIMIT
);

/**
 * @param {string} question
 * @param {{limit?:number, charBudget?:number}} opts
 */
export function retrieve(question, { limit = 40, charBudget = 13000 } = {}) {
  const terms = expand(tokenize(question));
  const termSet = new Set(terms);

  // Identity lines are appended after the fill, so their cost is set aside
  // first. Without this the passage set quietly overruns the budget it was
  // given, and the budget exists because the free tier is 8000 tokens/minute.
  const IDENTITY_RESERVE = Math.min(700, Math.round(charBudget * 0.08));
  const fillBudget = charBudget - IDENTITY_RESERVE;

  const scored = PARAS.map((p) => {
    let score = 0;
    for (const t of terms) if (p.tokens.has(t)) score += idf(t);
    if (score === 0) return null;

    if (p.evidenceType === 'observed') score *= 1.35;
    if (/\d{2}[-/]\d{2}[-/]\d{2}|\b(yes|no|y|n)\b\s*\|/i.test(p.text)) score *= 1.15;
    score /= 1 + Math.log(1 + p.text.length / 900);
    return { ...p, score };
  }).filter(Boolean);

  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  let chars = 0;
  const takenDocs = new Set();

  // A small record that matches the question at all goes in complete. This is
  // what puts the unrevoked contractor Admin in front of the model.
  for (const doc of WHOLE_DOCS) {
    const hit = doc.text.split('\n').some((line) => {
      const toks = tokenize(line);
      return toks.length && toks.some((t) => termSet.has(t));
    });
    if (!hit) continue;
    if (chars + doc.text.length > fillBudget) continue;
    picked.push({
      docId: doc.docId, docName: doc.docName, evidenceType: doc.evidenceType,
      date: doc.date, text: doc.text, score: 99, whole: true,
    });
    chars += doc.text.length;
    takenDocs.add(doc.docId);
  }

  // Diversity floor, then global fill.
  //
  // Pure round-robin gave every document its single best paragraph and ran out
  // of slots — which meant the VAPT recommendation arrived without the policy
  // line it contradicts, and a conflict with only one side is not a conflict.
  // So: one paragraph each from the documents that genuinely bear on the
  // question, then spend what is left on the highest-scoring passages anywhere.
  const remaining = scored.filter((p) => !takenDocs.has(p.docId));
  const best = remaining[0]?.score ?? 0;
  const RELEVANT = best * 0.15;

  const PER_DOC_CAP = 5;
  const perDoc = {};
  const push = (p) => {
    if (picked.length >= limit || chars + p.text.length > fillBudget) return false;
    if ((perDoc[p.docId] ?? 0) >= PER_DOC_CAP) return false;
    perDoc[p.docId] = (perDoc[p.docId] ?? 0) + 1;
    picked.push(p);
    chars += p.text.length;
    return true;
  };

  const seenDoc = new Set();
  for (const p of remaining) {
    if (seenDoc.has(p.docId) || p.score < RELEVANT) continue;
    seenDoc.add(p.docId);
    push(p);
  }
  for (const p of remaining) {
    if (picked.includes(p)) continue;
    push(p);
  }

  picked.sort((a, b) => b.score - a.score);

  // Every document that made it in declares whose it is. These lines are ~30
  // characters, so they cost nothing against the budget and they are the only
  // way a provenance question can ever be answered with a citation.
  for (const docId of new Set(picked.map((p) => p.docId))) {
    const id = DOC_IDENTITY[docId];
    if (!id) continue;
    if (picked.some((p) => p.docId === docId && p.text.includes(id.text))) continue;
    if (chars + id.text.length > charBudget) break;
    chars += id.text.length;
    picked.push(id);
  }

  return picked.map(({ docId, docName, evidenceType, date, text, score, whole, identity }) => ({
    docId, docName, evidenceType, date, text, score: Number(score.toFixed(2)),
    whole: !!whole, identity: !!identity,
  }));
}

/** Formats retrieved passages for the prompt. */
export function passagesForPrompt(passages) {
  return passages
    .map(
      (p, i) =>
        `[${i + 1}] docId: ${p.docId}\n` +
        `    document: ${p.docName}\n` +
        `    evidenceType: ${p.evidenceType}${p.date ? `  date: ${p.date}` : ''}\n` +
        `    text: ${p.text}`
    )
    .join('\n\n');
}

/**
 * Exposed so a caller can ask whether a message carries a topic at all, using
 * the same stopword list the scorer uses. Answering that question with a
 * different word list than retrieval scores on is how you get a heuristic that
 * disagrees with the thing it is guarding.
 */
export const meaningfulTerms = (s) => tokenize(s);

export const retrievalStats = () => ({ paragraphs: PARAS.length, documents: DOCS.length });
