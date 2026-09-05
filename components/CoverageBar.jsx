'use client';

export const STATES = [
  { key: 'verified',  label: 'verified',  color: 'var(--green)',  help: 'found in their documents, with a citation' },
  { key: 'confirmed', label: 'confirmed', color: 'var(--blue)',   help: 'the vendor told us' },
  { key: 'partial',   label: 'partial',   color: 'var(--violet)', help: 'answered, but a detail is missing' },
  { key: 'unknown',   label: 'unknown',   color: 'var(--amber)',  help: 'an honest, visible gap' },
  { key: 'conflict',  label: 'conflict',  color: 'var(--red)',    help: 'sources disagree — a human must rule' },
];

export default function CoverageBar({ coverage }) {
  if (!coverage) return null;
  const { states, evidence, total } = coverage;

  return (
    <div className="space-y-2">
      <div className="relative flex h-[3px] w-full overflow-hidden bg-[#16161d]">
        {STATES.map(({ key, color }) =>
          states[key] ? (
            <div key={key} style={{ width: `${(states[key] / total) * 100}%`, background: color }} />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {STATES.map(({ key, label, color, help }) => (
          <span key={key} className="mono flex items-center gap-1.5 text-[10px] tracking-wider" title={help}>
            <span className="h-[7px] w-[7px]" style={{ background: color }} />
            <span className="font-semibold" style={{ color }}>{states[key] ?? 0}</span>
            <span className="uppercase text-[var(--muted)]">{label}</span>
          </span>
        ))}
        <span className="mono ml-auto text-[10px] tracking-wider text-[var(--dim)]">
          <span className="text-[var(--muted)]">EVIDENCE</span>{'  '}
          {evidence.observed ?? 0} OBSERVED · {evidence.attested ?? 0} ATTESTED · {evidence.asserted ?? 0} ASSERTED
        </span>
      </div>
    </div>
  );
}
