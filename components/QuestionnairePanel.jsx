'use client';
import { useState } from 'react';
import EvidenceChip from './EvidenceChip';

const DOT = {
  verified:  'var(--green)',
  confirmed: 'var(--blue)',
  partial:   'var(--violet)',
  unknown:   'var(--amber)',
  conflict:  'var(--red)',
};

function Row({ a, onPick }) {
  const [open, setOpen] = useState(false);
  const isConflict = a.status === 'conflict';
  const srcCount = a.evidence?.length ?? 0;

  return (
    <div
      className="border-b border-[var(--line-soft)]"
      style={isConflict ? { background: 'rgba(239,68,68,.045)' } : undefined}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,.02)]"
      >
        <span className="mt-[7px] h-[7px] w-[7px] shrink-0" style={{ background: DOT[a.status] ?? '#333' }} />
        <span className="mono mt-[3px] w-11 shrink-0 text-[10px] tracking-wider text-[var(--dim)]">
          Q{a.num}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-snug text-[var(--ink)]">{a.questionText}</span>
          {a.value && (
            <span className="mt-0.5 block truncate text-[11px] leading-snug text-[var(--muted)]">{a.value}</span>
          )}
          {!a.value && isConflict && (
            <span className="mono mt-0.5 block truncate text-[10px] tracking-wide text-[var(--red)]">
              SOURCES DISAGREE — {a.conflict?.nature?.replace(/_/g, ' ')}
            </span>
          )}
        </span>
        {isConflict ? (
          <span className="mono shrink-0 bg-[var(--red-deep)] px-1.5 py-[2px] text-[9px] font-bold tracking-widest text-white">
            CONFLICT
          </span>
        ) : srcCount > 0 ? (
          <span
            className="mono shrink-0 text-[9px] tracking-wider text-[var(--dim)]"
            title={`${srcCount} citation${srcCount === 1 ? '' : 's'} · confidence ${Math.round(a.confidence * 100)}%`}
          >
            {srcCount} SRC
          </span>
        ) : null}
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-4 pl-[72px]">
          {a.conflict && (
            <div className="border border-[rgba(239,68,68,.4)] bg-[rgba(239,68,68,.05)] p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="mono bg-[var(--red-deep)] px-1.5 py-[2px] text-[9px] font-bold tracking-widest text-white">
                  // CONTRADICTION DETECTED
                </span>
                <span className="mono text-[9px] uppercase tracking-widest text-[var(--red)]">
                  {a.conflict.nature}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {a.conflict.sources.map((s, i) => (
                  <div key={i}>
                    <div className="label mb-1" style={{ color: s.evidenceType === 'observed' ? 'var(--green)' : 'var(--muted)' }}>
                      ▸ source_{String(i + 1).padStart(2, '0')} · {s.evidenceType === 'observed' ? 'reality' : 'intent'}
                    </div>
                    <EvidenceChip item={s} dense />
                  </div>
                ))}
              </div>
              {a.conflict.proposedQuestion && (
                <button
                  onClick={() => onPick(a.questionId)}
                  className="mono mt-3 w-full border border-[var(--red-deep)] bg-[rgba(220,38,38,.12)] px-3 py-2 text-left text-[11px] leading-snug text-[#ff8a8a] hover:bg-[rgba(220,38,38,.2)]"
                >
                  <span className="tracking-widest text-[var(--red)]">ASK ▸ </span>
                  {a.conflict.proposedQuestion}
                </button>
              )}
            </div>
          )}

          {a.evidence?.map((e, i) => <EvidenceChip key={i} item={e} />)}

          {!a.evidence?.length && !a.conflict && (
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              <span className="mono tracking-wider text-[var(--amber)]">NEEDS CONFIRMATION — not evidenced in your documents. </span>
              {a.followUpQuestion}
            </p>
          )}

          {(a.status === 'unknown' || a.status === 'partial') && (
            <button
              onClick={() => onPick(a.questionId)}
              className="mono border border-[var(--line)] bg-[var(--panel-2)] px-3 py-1.5 text-[10px] font-semibold tracking-widest text-[var(--ink)] hover:border-[var(--muted)]"
            >
              ANSWER THIS ▸
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuestionnairePanel({ profile, onPick, only }) {
  let answers = Object.values(profile.answers);
  if (only === 'conflict') answers = answers.filter((a) => a.conflict);
  if (only === 'open') answers = answers.filter((a) => a.status === 'unknown' || a.status === 'partial');
  const topics = [...new Set(answers.map((a) => a.topic))];

  if (!answers.length) {
    return (
      <div className="grid h-full place-items-center">
        <p className="mono text-[11px] tracking-widest text-[var(--muted)]">NOTHING HERE — ALL RESOLVED</p>
      </div>
    );
  }

  return (
    <div className="scan h-full overflow-y-auto">
      {topics.map((topic) => {
        const rows = answers.filter((a) => a.topic === topic);
        const conflicts = rows.filter((r) => r.conflict).length;
        return (
          <section key={topic}>
            <h3 className="sticky top-0 z-10 flex items-center gap-2 border-y border-[var(--line)] bg-[#0b0b10]/95 px-4 py-1.5 backdrop-blur">
              <span className="mono text-[10px] tracking-[.14em] text-[var(--muted)]">
                <span className="text-[var(--dim)]">|</span> {topic.toUpperCase()}
              </span>
              <span className="mono text-[9px] tracking-wider text-[var(--dim)]">
                [ {String(rows.length).padStart(2, '0')} ]
              </span>
              {conflicts > 0 && (
                <span className="mono ml-auto bg-[var(--red-deep)] px-1.5 py-[1px] text-[9px] font-bold tracking-widest text-white">
                  {conflicts} CONFLICT{conflicts > 1 ? 'S' : ''}
                </span>
              )}
            </h3>
            {rows.map((a) => <Row key={a.questionId} a={a} onPick={onPick} />)}
          </section>
        );
      })}
    </div>
  );
}
