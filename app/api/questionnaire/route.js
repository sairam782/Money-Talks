import { initialProfile } from '@/lib/profile';

/**
 * The deliverable. A completed questionnaire that distinguishes what was proven
 * from what was merely claimed, and shows its gaps rather than hiding them.
 */

const LABEL = {
  verified:  ['VERIFIED',  '#047857', 'found in Regodit documents, with citation'],
  confirmed: ['CONFIRMED', '#0369a1', 'stated by the vendor'],
  partial:   ['PARTIAL',   '#6d28d9', 'answered, detail outstanding'],
  unknown:   ['UNKNOWN',   '#b45309', 'no evidence found — outstanding'],
  conflict:  ['CONFLICT',  '#be123c', 'sources disagree — unresolved'],
};
const EV = { observed: 'observed (reality)', attested: 'attested (intent)', asserted: 'asserted (testimony)' };

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** GET renders the corpus pass. POST renders the live profile, including
 *  everything the user confirmed or ruled on during the interview. */
export async function POST(req) {
  const { profile } = await req.json().catch(() => ({}));
  return render(profile?.answers ? profile : initialProfile());
}

export async function GET() {
  return render(initialProfile());
}

function render(profile) {
  const answers = Object.values(profile.answers);
  const topics = [...new Set(answers.map((a) => a.topic))];

  const tally = {};
  for (const a of answers) tally[a.status] = (tally[a.status] ?? 0) + 1;
  const evTally = {};
  for (const a of answers) for (const e of a.evidence) evTally[e.evidenceType] = (evTally[e.evidenceType] ?? 0) + 1;

  const rows = topics
    .map((topic) => {
      const inTopic = answers.filter((a) => a.topic === topic);
      return `
    <h2>${esc(topic)}</h2>
    ${inTopic
      .map((a) => {
        const [label, colour, meaning] = LABEL[a.status] ?? LABEL.unknown;
        const evidence = a.evidence
          .map(
            (e) => `<div class="ev"><span class="tag">${EV[e.evidenceType] ?? e.evidenceType}</span>
              <b>${esc(e.docName)}</b>${e.date ? ` <span class="date">${esc(e.date)}</span>` : ''}
              <blockquote>&ldquo;${esc(e.quote)}&rdquo;</blockquote></div>`
          )
          .join('');
        const conflict = a.conflict
          ? `<div class="conflict"><b>Unresolved conflict</b> — ${esc(a.conflict.nature?.replace(/_/g, ' '))}
             ${a.conflict.sources
               .map((s) => `<div class="ev"><span class="tag">${EV[s.evidenceType] ?? ''}</span><b>${esc(s.docName)}</b>
                  <blockquote>&ldquo;${esc(s.quote)}&rdquo;</blockquote></div>`)
               .join('')}
             <p class="ask">Outstanding question: ${esc(a.conflict.proposedQuestion)}</p></div>`
          : '';
        const gap =
          !a.evidence.length && !a.conflict && a.followUpQuestion
            ? `<p class="ask">Outstanding question: ${esc(a.followUpQuestion)}</p>`
            : '';
        return `
      <div class="q">
        <div class="qh"><span class="num">${esc(a.num)}</span>
          <span class="qt">${esc(a.questionText)}</span>
          <span class="badge" style="background:${colour}" title="${meaning}">${label}</span></div>
        ${a.value ? `<p class="ans">${esc(a.value)}</p>` : ''}
        ${evidence}${conflict}${gap}
      </div>`;
      })
      .join('')}`;
    })
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Regodit — Completed Vendor Security Questionnaire</title>
<style>
 :root{color-scheme:light only}
 html{background:#fff}
 body{background:#fff;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;max-width:860px;margin:40px auto;padding:0 24px}
 h1{font-size:22px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin:0 0 22px}
 h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:30px 0 10px;padding-bottom:5px;border-bottom:1px solid #e2e8f0}
 .summary{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:8px}
 .summary b{font-size:17px} .summary span{color:#64748b;font-size:12px;margin-right:16px}
 .q{padding:11px 0;border-bottom:1px solid #f1f5f9}
 .qh{display:flex;gap:9px;align-items:baseline}
 .num{color:#94a3b8;font-size:12px;min-width:30px} .qt{flex:1;font-weight:600;color:#0f172a}
 .badge{color:#fff;font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;letter-spacing:.04em}
 .ans{margin:6px 0 6px 39px;color:#334155}
 .ev{margin:6px 0 6px 39px;font-size:12.5px;color:#475569}
 .tag{background:#f1f5f9;border-radius:3px;padding:1px 5px;font-size:10px;color:#475569;margin-right:6px}
 .date{color:#94a3b8;font-size:11px}
 blockquote{margin:3px 0 0;padding-left:9px;border-left:2px solid #cbd5e1;color:#64748b;font-style:italic}
 .conflict{margin:8px 0 8px 39px;padding:10px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;font-size:12.5px}
 .conflict .ev{margin-left:0}
 .ask{color:#9f1239;font-weight:500;margin:8px 0 0}
 @media print{body{margin:0}.q{break-inside:avoid}}
</style></head><body>
<h1>Vendor Security Questionnaire — Regodit</h1>
<p class="sub">Completed from Regodit's own documentation on ${new Date().toISOString().slice(0, 10)}.
Every answer marked <b>verified</b> carries a quotation from a named source document.
Nothing on this page was inferred.</p>
<div class="summary">
  <div><b>${answers.length}</b> questions ·
   ${Object.entries(tally).map(([k, v]) => `<span>${v} ${k}</span>`).join('')}</div>
  <div style="margin-top:6px">Evidence:
   ${Object.entries(evTally).map(([k, v]) => `<span>${v} ${k}</span>`).join('')}</div>
</div>
${rows}
<p class="sub" style="margin-top:30px">Answers marked <b>unknown</b> are deliberate. Where the
documents did not support an answer, none was given.</p>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
