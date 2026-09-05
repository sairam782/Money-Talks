'use client';

const TYPE = {
  observed: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', label: 'observed', tip: 'reality — a record, scan or log' },
  attested: { cls: 'bg-slate-50 text-slate-700 ring-slate-200',       label: 'attested', tip: 'intent — a policy or plan' },
  asserted: { cls: 'bg-sky-50 text-sky-800 ring-sky-200',             label: 'asserted', tip: 'testimony — a human said so' },
};

export default function EvidenceChip({ item }) {
  const t = TYPE[item.evidenceType] ?? TYPE.attested;
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${t.cls}`} title={t.tip}>
          {t.label}
        </span>
        <span className="truncate font-medium text-slate-600">{item.docName}</span>
        {item.date && <span className="ml-auto shrink-0 text-slate-400">{item.date}</span>}
      </div>
      <p className="leading-snug text-slate-600">&ldquo;{item.quote}&rdquo;</p>
    </div>
  );
}
