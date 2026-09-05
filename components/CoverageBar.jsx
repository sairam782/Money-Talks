'use client';

export const STATES = [
  { key: 'verified',  label: 'verified',  color: 'var(--green)',  help: 'found in their documents, with a citation' },
  { key: 'confirmed', label: 'confirmed', color: 'var(--blue)',   help: 'the vendor told us' },
  { key: 'partial',   label: 'partial',   color: 'var(--violet)', help: 'answered, but a detail is missing' },
  { key: 'unknown',   label: 'needs confirmation', color: 'var(--amber)',  help: 'not evidenced in the documents — we ask you' },
  { key: 'conflict',  label: 'conflict',  color: 'var(--red)',    help: 'sources disagree — a human must rule' },
];

export default function CoverageBar({ coverage }) {
  if (!coverage) return null;
  const { states, evidence, total } = coverage;

  return (
    <div className="space-y-2">
      <div className="relative flex h-[3px] w-full overflow-hidden bg-[var(--track)]">
        {STATES.map(({ key, color }) =>
          states[key] ? (
            <div key={key} style={{ width: `${(states[key] / total) * 100}%`, background: color }} />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {STATES.map(({ key, label, color, help }) =>
          states[key] ? (
            <span key={key} className="mono flex items-center gap-1.5 text-[9px] tracking-wider" title={help}>
              <span className="h-[6px] w-[6px]" style={{ background: color }} />
              <span className="uppercase text-[var(--dim)]">{label}</span>
            </span>
          ) : null
        )}
        <span className="mono ml-auto text-[9px] tracking-wider text-[var(--dim)]">
          {evidence.observed ?? 0} observed · {evidence.attested ?? 0} attested · {evidence.asserted ?? 0} asserted
        </span>
      </div>
    </div>
  );
}
