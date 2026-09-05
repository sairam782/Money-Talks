import fs from 'fs';
import path from 'path';

const raw = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'data', 'corpus.json'), 'utf8')
);

// The questionnaire workbook is where the QUESTIONS come from. It is not
// evidence about Regodit, so it never enters the corpus we cite from.
const NOT_EVIDENCE = new Set([
  'regodit_comprehensive_vendor_security_questionnaire_clean',
]);

// ARCHITECTURE.md §5: observed is reality, attested is intent.
// Folder is a good default; these four are not what their folder implies.
const EVIDENCE_TYPE_OVERRIDE = {
  solsphere_w9: 'attested',   // a filed declaration, not an observation
  // Architecture diagrams describe the system as built, not as intended.
  network_segmentation_diagram: 'observed',
  admin_access_logging_diagram: 'observed',
  vapt_report_01: 'observed',                       // findings against a live system
  regodit_ai_soc2_type_ii_report_test: 'attested',  // an auditor's opinion
  bcp_dr_plan_solsphere: 'attested',                // a plan, not a drill record
  secure_development_lifecycle_document_01: 'attested',
};

const EVIDENCE_TYPE_BY_FOLDER = {
  '2. Company policies': 'attested',
  '3. Security Assessment Reports': 'attested',
  '4. Contracts_agreements': 'attested',
  '5. Infrastructure_internal info': 'observed',
};

// Dates we can read off the documents themselves, for recency weighting when
// two sources disagree. Null means undated — treat as weaker, never as newer.
const DOC_DATE = {
  network_segmentation_diagram: '2026-09-04',
  admin_access_logging_diagram: '2026-09-04',
  access_review_records: '2026-09-04',
  asset_inventory_regodit: '2026-08-30',
};

export const DOCS = raw
  .filter((d) => !NOT_EVIDENCE.has(d.docId))
  .map((d) => ({
    docId: d.docId,
    docName: d.docName,
    folder: d.folder,
    evidenceType:
      EVIDENCE_TYPE_OVERRIDE[d.docId] ??
      EVIDENCE_TYPE_BY_FOLDER[d.folder] ??
      'attested',
    date: DOC_DATE[d.docId] ?? null,
    text: d.text,
  }));

export const DOC_BY_ID = Object.fromEntries(DOCS.map((d) => [d.docId, d]));

// Normalise for comparison only. We compare on this, but we always show the
// model's original quote back to the user.
const norm = (s) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * ARCHITECTURE.md §2, hard rule 2: no citation, no answer.
 *
 * This is the function that makes a weaker model safe. If the model cannot
 * produce a quote that literally appears in the corpus, it has no evidence,
 * and the caller must downgrade the answer rather than print it.
 */
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const BY_SLUG = {};
for (const d of DOCS) {
  BY_SLUG[slug(d.docId)] = d;
  BY_SLUG[slug(d.docName)] = d;
}

/**
 * Models cite documents by whatever string looks like a name to them — the
 * docId, the filename, the title with spaces. Rejecting a real quote because
 * the label was formatted differently would throw away good evidence, so we
 * resolve generously and validate the quote strictly.
 */
export function resolveDoc(docId) {
  if (DOC_BY_ID[docId]) return DOC_BY_ID[docId];
  const k = slug(docId);
  if (BY_SLUG[k]) return BY_SLUG[k];
  const hit = Object.keys(BY_SLUG).find((x) => x.startsWith(k) || k.startsWith(x));
  return hit ? BY_SLUG[hit] : null;
}

export function validateQuote(docId, quote) {
  const doc = resolveDoc(docId);
  if (!doc) return { ok: false, reason: 'unknown docId' };
  if (!quote || norm(quote).length < 12) return { ok: false, reason: 'quote too short' };
  if (!norm(doc.text).includes(norm(quote))) {
    return { ok: false, reason: 'quote not found in document' };
  }
  return {
    ok: true, docId: doc.docId, evidenceType: doc.evidenceType,
    docName: doc.docName, date: doc.date,
  };
}

/** Drops any evidence item whose quote cannot be found verbatim. */
export function keepOnlyRealEvidence(evidence = []) {
  const kept = [];
  const rejected = [];
  for (const e of evidence) {
    const v = validateQuote(e.docId, e.quote);
    if (v.ok) {
      kept.push({
        docId: v.docId,
        docName: v.docName,
        quote: e.quote,
        evidenceType: v.evidenceType,
        date: v.date,
      });
    } else {
      rejected.push({ ...e, reason: v.reason });
    }
  }
  return { kept, rejected };
}

export const corpusStats = () => ({
  documents: DOCS.length,
  chars: DOCS.reduce((n, d) => n + d.text.length, 0),
  observed: DOCS.filter((d) => d.evidenceType === 'observed').length,
  attested: DOCS.filter((d) => d.evidenceType === 'attested').length,
});
