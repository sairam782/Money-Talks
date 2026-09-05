'use client';

const TYPE = {
  observed: { tag: 'OBSERVED', sub: 'reality',    color: 'var(--green)',  bg: 'rgba(34,197,94,.08)',  bd: 'rgba(34,197,94,.28)' },
  attested: { tag: 'ATTESTED', sub: 'intent',     color: '#9aa4b2',       bg: 'rgba(154,164,178,.07)', bd: 'rgba(154,164,178,.22)' },
  asserted: { tag: 'ASSERTED', sub: 'testimony',  color: 'var(--blue)',   bg: 'rgba(59,130,246,.08)', bd: 'rgba(59,130,246,.28)' },
};

export default function EvidenceChip({ item, dense = false }) {
  const t = TYPE[item.evidenceType] ?? TYPE.attested;
  return (
    <div className="border p-2.5" style={{ background: 'var(--panel-2)', borderColor: 'var(--line)' }}>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="mono px-1.5 py-[1px] text-[9px] font-semibold tracking-widest"
          style={{ color: t.color, background: t.bg, border: `1px solid ${t.bd}` }}
          title={`${t.tag.toLowerCase()} — ${t.sub}`}
        >
          {t.tag}
        </span>
        <span className="mono truncate text-[10px] tracking-wide text-[var(--ink)]">{item.docName}</span>
        {item.date && <span className="mono ml-auto shrink-0 text-[9px] text-[var(--dim)]">{item.date}</span>}
      </div>
      <p className={`leading-snug text-[var(--muted)] ${dense ? 'text-[11px]' : 'text-xs'}`}>
        &ldquo;{item.quote}&rdquo;
      </p>
    </div>
  );
}
