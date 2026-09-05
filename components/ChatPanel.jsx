'use client';
import { useEffect, useRef, useState } from 'react';
import EvidenceChip from './EvidenceChip';

export default function ChatPanel({ messages, onSend, pending, target }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);
  // Block body on purpose: a concise arrow returns the call's value, and React
  // reads anything an effect returns as a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || pending) return;
    setText('');
    onSend(v);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2">
        <span className="live-dot h-[6px] w-[6px] rounded-full bg-[var(--green)]" />
        <span className="label">secure_channel</span>
        
      </div>

      <div className="scan flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i}>
            <div className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div
                className={`max-w-[88%] whitespace-pre-wrap px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[var(--red-deep)] text-white'
                    : 'border border-[var(--line)] bg-[var(--panel-2)] text-[var(--ink)]'
                }`}
              >
                {m.text}
              </div>
            </div>
            {m.evidence?.length > 0 && (
              <div className="mt-2 max-w-[88%] space-y-1.5">
                <div className="label">
                  {m.evidence.length} citation{m.evidence.length > 1 ? 's' : ''} · not one of the 66
                </div>
                {m.evidence.map((e, j) => (
                  <EvidenceChip key={j} item={e} dense />
                ))}
              </div>
            )}
            {m.status === 'unknown' && !m.evidence?.length && (
              <div className="label mt-2 text-[var(--amber)]">no evidence in the documents</div>
            )}
          </div>
        ))}
        {pending && (
          <div>
            <div className="relative inline-block overflow-hidden border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2">
              <span className="mono text-[11px] tracking-widest text-[var(--muted)]">ANALYSING…</span>
              <span className="sweep pointer-events-none absolute inset-0" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {target && (
        <div className="border-t border-[var(--line)] bg-[rgba(234,179,8,.05)] px-4 py-2">
          <span className="mono text-[10px] tracking-wider text-[var(--amber)]">
            ON_QUESTION {target.num}
          </span>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{target.questionText}</p>
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t border-[var(--line)] p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={target ? 'Answer, or ask me anything…' : 'Type to begin…'}
          className="mono flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--red-deep)]"
        />
        <button
          disabled={pending || !text.trim()}
          className="mono border border-[var(--red-deep)] bg-[var(--red-deep)] px-4 py-2 text-[10px] font-semibold tracking-widest text-white disabled:opacity-30"
        >
          SEND
        </button>
      </form>
    </div>
  );
}
