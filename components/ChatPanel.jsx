'use client';
import { useEffect, useRef, useState } from 'react';
import EvidenceChip from './EvidenceChip';
import { useVoice } from './useVoice';

export default function ChatPanel({ messages, onSend, pending, target, onClearTarget, runId }) {
  const [text, setText] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const spokenRef = useRef(-1);
  const voice = useVoice({ runId });
  // Block body on purpose: a concise arrow returns the call's value, and React
  // reads anything an effect returns as a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  // Speak the newest reply when the toggle is on. Tracking the index we last
  // spoke stops a re-render from starting the same sentence twice, and browsers
  // only allow this at all because switching the toggle on was a user gesture.
  useEffect(() => {
    if (!autoSpeak) return;
    const i = messages.length - 1;
    const last = messages[i];
    if (!last || last.role !== 'assistant' || spokenRef.current >= i) return;
    spokenRef.current = i;
    voice.play(last.text, i);
  }, [messages, autoSpeak, voice]);

  /**
   * A recording lands in the input box, not in the profile. The user reads it
   * and presses send — an answer to a security questionnaire is not something
   * to record on the strength of a transcript nobody checked.
   */
  const toggleMic = async () => {
    if (voice.recording) {
      const heard = await voice.stopRecording();
      if (heard) {
        setText((t) => (t ? `${t} ${heard}` : heard));
        inputRef.current?.focus();
      }
      return;
    }
    voice.startRecording();
  };

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

        <button
          type="button"
          onClick={() => { if (autoSpeak) voice.stop(); setAutoSpeak((v) => !v); }}
          title={autoSpeak ? 'Stop reading replies aloud' : 'Read replies aloud'}
          aria-pressed={autoSpeak}
          className={`mono ml-auto border px-2 py-0.5 text-[9px] font-semibold tracking-widest transition-colors ${
            autoSpeak
              ? 'border-[var(--red-deep)] bg-[var(--red-deep)] text-white'
              : 'border-[var(--line)] text-[var(--dim)] hover:text-[var(--muted)]'
          }`}
        >
          VOICE {autoSpeak ? 'ON' : 'OFF'}
        </button>
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
            {m.role === 'assistant' && m.text && (
              <button
                type="button"
                onClick={() => (voice.speakingIndex === i ? voice.stop() : voice.play(m.text, i))}
                title={voice.speakingIndex === i ? 'Stop' : 'Read this aloud'}
                className="mono mt-1 text-[9px] tracking-widest text-[var(--dim)] hover:text-[var(--red-deep)]"
              >
                {voice.speakingIndex === i ? '■ STOP' : '▶ PLAY'}
              </button>
            )}
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
        <div className="flex items-start gap-2 border-t border-[var(--line)] bg-[#fffbeb] px-4 py-2">
          <div className="min-w-0 flex-1">
            <span className="mono text-[10px] tracking-wider text-[var(--amber)]">
              ON_QUESTION {target.num}
            </span>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{target.questionText}</p>
          </div>
          <button
            type="button"
            onClick={onClearTarget}
            title="Stop answering this question"
            aria-label="Stop answering this question"
            className="mono -mr-1 shrink-0 px-1.5 py-0.5 text-[13px] leading-none text-[var(--dim)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>
      )}

      {voice.error && (
        // Voice failing is a downgrade, not a broken app — the reply is already
        // on screen and readable. Say so quietly and stay out of the way.
        <div className="label border-t border-[var(--line)] px-4 py-1.5 text-[var(--amber)]">
          voice unavailable · {voice.error}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t border-[var(--line)] p-3">
        <button
          type="button"
          onClick={toggleMic}
          disabled={voice.busy}
          title={voice.recording ? 'Stop recording' : 'Answer out loud'}
          aria-label={voice.recording ? 'Stop recording' : 'Answer out loud'}
          className={`mono shrink-0 border px-3 py-2 text-[11px] leading-none transition-colors disabled:opacity-30 ${
            voice.recording
              ? 'border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]'
              : 'border-[var(--line)] text-[var(--dim)] hover:text-[var(--ink)]'
          }`}
        >
          {voice.busy ? '…' : voice.recording ? '■' : '●'}
        </button>
        <input
          ref={inputRef}
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
