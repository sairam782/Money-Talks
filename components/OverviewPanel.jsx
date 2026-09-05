'use client';

/**
 * The overview. Answers "where does this company actually stand?" before you
 * read a single row — and makes the observed/attested ratio an argument rather
 * than a statistic buried in the header.
 */

function Tile({ n, label, sub, color }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="text-[30px] font-bold leading-none tabular-nums" style={{ color: color ?? 'var(--ink)' }}>
        {n}
      </div>
      <div className="label mt-2.5">{label}</div>
      <div className="mt-1 text-[11px] text-[var(--dim)]">{sub}</div>
    </div>
  );
}

export default function OverviewPanel({ profile, onPick, onSeeConflicts }) {
  const all = Object.values(profile.answers);

  const count = (s) => all.filter((a) => a.status === s).length;
  const conflicts = all.filter((a) => a.conflict);

  const ev = { observed: 0, attested: 0, asserted: 0 };
  for (const a of all) for (const e of a.evidence ?? []) ev[e.evidenceType] = (ev[e.evidenceType] ?? 0) + 1;
  const evTotal = ev.observed + ev.attested + ev.asserted || 1;

  const topics = [...new Set(all.map((a) => a.topic))].map((t) => {
    const rows = all.filter((a) => a.topic === t);
    const pct = (s) => (rows.filter((r) => r.status === s).length / rows.length) * 100;
    return {
      name: t,
      total: rows.length,
      settled: rows.filter((r) => r.status === 'verified' || r.status === 'confirmed').length,
      verified: pct('verified'),
      confirmed: pct('confirmed'),
      partial: pct('partial'),
      conflict: pct('conflict'),
    };
  }).sort((a, b) => b.conflict - a.conflict || b.verified - a.verified);

  return (
    <div className="scan h-full overflow-y-auto p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile n="21" label="documents read" sub="before asking anything" />
        <Tile n={count('verified')} label="verified" sub="quoted from source" color="var(--green)" />
        <Tile n={conflicts.length} label="contradictions" sub="awaiting a ruling" color="var(--red)" />
        <Tile n={count('unknown')} label="to confirm" sub="not in the documents" color="var(--amber)" />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.25fr_1fr]">
        {/* coverage by control area */}
        <div className="border border-[var(--line)] bg-[var(--panel)]">
          <div className="label border-b border-[var(--line)] px-4 py-2.5">coverage by control area</div>
          <div className="space-y-3 p-4">
            {topics.map((t) => (
              <div key={t.name}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="truncate text-[12px] text-[var(--ink)]">{t.name}</span>
                  <span className="mono ml-auto shrink-0 text-[10px] text-[var(--dim)]">
                    {t.settled}/{t.total}
                  </span>
                </div>
                <div className="flex h-[5px] bg-[#16161d]">
                  <div style={{ width: `${t.verified}%`, background: 'var(--green)' }} />
                  <div style={{ width: `${t.confirmed}%`, background: 'var(--blue)' }} />
                  <div style={{ width: `${t.partial}%`, background: 'var(--violet)' }} />
                  <div style={{ width: `${t.conflict}%`, background: 'var(--red)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* the thesis, made visible */}
        <div className="border border-[var(--line)] bg-[var(--panel)]">
          <div className="label border-b border-[var(--line)] px-4 py-2.5">evidence mix</div>
          <div className="space-y-3.5 p-4">
            {[
              { k: 'observed', word: 'reality', n: ev.observed, color: 'var(--green)', bg: 'rgba(34,197,94,.08)', bd: 'rgba(34,197,94,.28)' },
              { k: 'attested', word: 'intent', n: ev.attested, color: '#9aa4b2', bg: 'rgba(154,164,178,.07)', bd: 'rgba(154,164,178,.22)' },
              { k: 'asserted', word: 'testimony', n: ev.asserted, color: 'var(--blue)', bg: 'rgba(59,130,246,.08)', bd: 'rgba(59,130,246,.28)' },
            ].map((r) => (
              <div key={r.k}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span
                    className="mono px-1.5 py-[1px] text-[9px] font-semibold tracking-widest"
                    style={{ color: r.color, background: r.bg, border: `1px solid ${r.bd}` }}
                  >
                    {r.k.toUpperCase()}
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">{r.word}</span>
                  <span className="ml-auto text-[17px] font-bold tabular-nums" style={{ color: r.color }}>
                    {r.n}
                  </span>
                </div>
                <div className="h-[4px] bg-[#16161d]">
                  <div style={{ width: `${(r.n / evTotal) * 100}%`, height: 4, background: r.color }} />
                </div>
              </div>
            ))}
            <p className="border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-[var(--muted)]">
              {ev.attested > ev.observed ? (
                <>
                  More <span className="text-[#9aa4b2]">intent</span> than{' '}
                  <span className="text-[var(--green)]">reality</span>. Policies say what should happen;
                  only {ev.observed} citations show what does.
                </>
              ) : (
                <>
                  {ev.observed} citations show what the systems actually do, against {ev.attested} that
                  state what policy requires.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* contradictions */}
      {conflicts.length > 0 && (
        <div className="mt-4 border border-[rgba(239,68,68,.4)] bg-[rgba(239,68,68,.05)]">
          <div className="flex items-center gap-2.5 border-b border-[rgba(239,68,68,.25)] px-4 py-2.5">
            <span className="mono bg-[var(--red-deep)] px-1.5 py-[2px] text-[9px] font-bold tracking-widest text-white">
              {conflicts.length} CONTRADICTION{conflicts.length > 1 ? 'S' : ''}
            </span>
            <span className="label">need a human ruling</span>
            <button
              onClick={onSeeConflicts}
              className="mono ml-auto text-[9px] tracking-widest text-[var(--red)] hover:text-[#ff8a8a]"
            >
              SEE ALL ▸
            </button>
          </div>
          {conflicts.map((c) => (
            <button
              key={c.questionId}
              onClick={() => onPick(c.questionId)}
              className="flex w-full items-center gap-3 border-b border-[rgba(239,68,68,.14)] px-4 py-2.5 text-left hover:bg-[rgba(239,68,68,.06)]"
            >
              <span className="mono w-11 shrink-0 text-[10px] text-[var(--dim)]">Q{c.num}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)]">{c.questionText}</span>
              <span className="mono hidden shrink-0 text-[9px] tracking-wide text-[var(--red)] md:block">
                {c.conflict.nature}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
