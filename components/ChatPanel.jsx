'use client';
import { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ messages, onSend, pending, target }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, pending]);

  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || pending) return;
    setText('');
    onSend(v);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {pending && (
          <div className="text-sm text-slate-400">thinking…</div>
        )}
        <div ref={endRef} />
      </div>

      {target && (
        <div className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Answering <span className="font-semibold">{target.num}</span> — {target.questionText}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 bg-white p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={target ? 'Your answer…' : 'Type to answer the next open question…'}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          disabled={pending || !text.trim()}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
