'use client';
import { useState } from 'react';
import EvidenceChip from './EvidenceChip';

const DOT = {
  verified:  'bg-emerald-500',
  confirmed: 'bg-sky-500',
  partial:   'bg-violet-500',
  unknown:   'bg-amber-500',
  conflict:  'bg-rose-600',
};

function Row({ a, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-slate-100 ${a.status === 'conflict' ? 'bg-rose-50/40' : ''}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50"
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.status] ?? 'bg-slate-300'}`} />
        <span className="w-9 shrink-0 pt-px text-xs tabular-nums text-slate-400">{a.num}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-800">{a.questionText}</span>
          {a.value && <span className="mt-0.5 block truncate text-xs text-slate-500">{a.value}</span>}
        </span>
        {a.conflict && (
          <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            CONFLICT
          </span>
        )}
        {a.confidence > 0 && (
          <span
            className="shrink-0 text-[10px] tabular-nums text-slate-400"
            title={`confidence ${Math.round(a.confidence * 100)}% · ${a.evidence.length} citation${a.evidence.length === 1 ? '' : 's'}`}
          >
            {Math.round(a.confidence * 100)}%
          </span>
        )}
        {a.evidence?.length > 0 && (
          <span className="shrink-0 text-[10px] tabular-nums text-slate-300">{a.evidence.length}</span>
        )}
      </button>

      {open && (
        <div className="space-y-2 bg-slate-50/70 px-3 pb-3 pl-14">
          {a.conflict && (
            <div className="rounded-md border border-rose-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold text-rose-800">
                Sources disagree — {a.conflict.nature?.replace(/_/g, ' ')}
              </p>
              <div className="space-y-1.5">
                {a.conflict.sources.map((s, i) => (
                  <EvidenceChip key={i} item={s} />
                ))}
              </div>
              {a.conflict.proposedQuestion && (
                <button
                  onClick={() => onPick(a.questionId)}
                  className="mt-2 rounded bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700"
                >
                  Ask: {a.conflict.proposedQuestion}
                </button>
              )}
            </div>
          )}

          {a.evidence?.map((e, i) => <EvidenceChip key={i} item={e} />)}

          {!a.evidence?.length && !a.conflict && (
            <p className="text-xs text-slate-500">
              Nothing in the documents answers this. {a.followUpQuestion}
            </p>
          )}

          {(a.status === 'unknown' || a.status === 'partial') && (
            <button
              onClick={() => onPick(a.questionId)}
              className="rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700"
            >
              Answer this
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuestionnairePanel({ profile, onPick }) {
  const answers = Object.values(profile.answers);
  const topics = [...new Set(answers.map((a) => a.topic))];

  return (
    <div className="h-full overflow-y-auto">
      {topics.map((topic) => {
        const rows = answers.filter((a) => a.topic === topic);
        const conflicts = rows.filter((r) => r.conflict).length;
        return (
          <section key={topic}>
            <h3 className="sticky top-0 z-10 flex items-center gap-2 border-y border-slate-200 bg-slate-100/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur">
              {topic}
              <span className="font-normal text-slate-400">{rows.length}</span>
              {conflicts > 0 && (
                <span className="ml-auto rounded bg-rose-600 px-1.5 text-[10px] text-white">
                  {conflicts}
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
