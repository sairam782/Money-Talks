'use client';

const STATES = [
  { key: 'verified',  label: 'verified',  cls: 'bg-emerald-500', help: 'found in their documents, with a citation' },
  { key: 'confirmed', label: 'confirmed', cls: 'bg-sky-500',     help: 'the vendor told us' },
  { key: 'partial',   label: 'partial',   cls: 'bg-violet-500',  help: 'answered, but a detail is missing' },
  { key: 'unknown',   label: 'unknown',   cls: 'bg-amber-500',   help: 'an honest, visible gap' },
  { key: 'conflict',  label: 'conflict',  cls: 'bg-rose-600',    help: 'sources disagree — a human must rule' },
];

export default function CoverageBar({ coverage }) {
  if (!coverage) return null;
  const { states, evidence, total } = coverage;

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        {STATES.map(({ key, cls }) =>
          states[key] ? (
            <div key={key} className={cls} style={{ width: `${(states[key] / total) * 100}%` }} />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {STATES.map(({ key, label, cls, help }) => (
          <span key={key} className="flex items-center gap-1.5" title={help}>
            <span className={`h-2 w-2 rounded-full ${cls}`} />
            <span className="font-medium tabular-nums text-slate-700">{states[key] ?? 0}</span>
            <span className="text-slate-500">{label}</span>
          </span>
        ))}
        <span className="ml-auto text-slate-400">
          evidence — {evidence.observed ?? 0} observed · {evidence.attested ?? 0} attested ·{' '}
          {evidence.asserted ?? 0} asserted
        </span>
      </div>
    </div>
  );
}
