'use client';
import { useEffect, useState, useMemo } from 'react';
import ChatPanel from '@/components/ChatPanel';
import QuestionnairePanel from '@/components/QuestionnairePanel';
import CoverageBar from '@/components/CoverageBar';

const STORAGE_KEY = 'regodit-profile-v1';

function coverageOf(profile) {
  const states = {};
  const evidence = {};
  const all = Object.values(profile.answers);
  for (const a of all) {
    states[a.status] = (states[a.status] ?? 0) + 1;
    for (const e of a.evidence ?? []) evidence[e.evidenceType] = (evidence[e.evidenceType] ?? 0) + 1;
  }
  return { states, evidence, total: all.length };
}

function Stat({ n, label, color }) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: color ?? 'var(--line)' }}>
      <div className="text-[26px] font-bold leading-none tracking-tight" style={{ color: color ?? 'var(--ink)' }}>
        {n}
      </div>
      <div className="label mt-1.5">{label}</div>
    </div>
  );
}

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [targetId, setTargetId] = useState(null);

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((fresh) => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const prev = JSON.parse(saved);
          if (prev.runId && prev.runId === fresh.runId) {
            setProfile(prev);
            setMessages([{ role: 'assistant', text: 'Picked up where we left off.' }]);
            return;
          }
          localStorage.removeItem(STORAGE_KEY);
        }
        setProfile(fresh);
        const all = Object.values(fresh.answers);
        const conflicts = all.filter((a) => a.conflict).length;
        const unknown = all.filter((a) => a.status === 'unknown').length;
        const verified = all.filter((a) => a.status === 'verified').length;
        setMessages([
          {
            role: 'assistant',
            text:
              `I read your 21 documents and answered all ${all.length} questions from them before asking you anything.\n\n` +
              `${verified} verified from your own documents. ${conflicts} conflicts where your documents contradict each other. ` +
              `${unknown} honest gaps I could not evidence.\n\n` +
              `Open a red row to see both sides quoted, or answer a gap below.`,
          },
        ]);
      });
  }, []);

  useEffect(() => {
    if (profile) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const coverage = useMemo(() => (profile ? coverageOf(profile) : null), [profile]);
  const target = targetId ? profile?.answers[targetId] : null;

  async function send(text) {
    const next = [...messages, { role: 'user', text }];
    setMessages(next);
    setPending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, profile, currentQuestionId: targetId, history: next.slice(-6) }),
      });
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
      setTargetId(data.nextQuestionId ?? null);
      setMessages((m) => [...m, { role: 'assistant', text: data.reply ?? 'Recorded.' }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: `Something went wrong: ${err.message}` }]);
    } finally {
      setPending(false);
    }
  }

  if (!profile) {
    return (
      <main className="flex h-screen items-center justify-center">
        <span className="mono text-[11px] tracking-widest text-[var(--muted)]">READING SOURCE DOCUMENTS…</span>
      </main>
    );
  }

  const all = Object.values(profile.answers);
  const s = coverage.states;

  return (
    <main className="flex h-screen flex-col">
      {/* status strip */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[#0a0a0e] px-4 py-1.5">
        <span className="live-dot h-[6px] w-[6px] rounded-full bg-[var(--red)]" />
        <span className="mono text-[10px] font-semibold tracking-[.16em] text-[var(--red)]">LIVE ANALYSIS</span>
        <span className="mono text-[10px] tracking-wider text-[var(--dim)]">
          run.{String(profile.runId ?? 'local').replace('run_', '').slice(-8)} · 21 sources ingested · {all.length} controls assessed
        </span>
      </div>

      {/* header */}
      <header className="border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center bg-[var(--red-deep)] text-[15px] font-black text-white">X</div>
            <div>
              <div className="text-[15px] font-bold leading-none tracking-tight">CROSS AI</div>
              <div className="label mt-1">ai security analyst</div>
            </div>
          </div>
          <div className="hidden border-l border-[var(--line)] pl-4 md:block">
            <div className="mono text-[11px] tracking-wider text-[var(--ink)]">
              REGODIT · VENDOR SECURITY QUESTIONNAIRE
            </div>
            <div className="mono mt-1 text-[10px] tracking-wider text-[var(--dim)]">
              answered.from.source.documents · zero.hallucination
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/questionnaire"
              className="mono bg-[var(--red-deep)] px-3.5 py-2 text-[10px] font-bold tracking-widest text-white hover:bg-[#b91c1c]"
            >
              GENERATE QUESTIONNAIRE ▸
            </a>
            <button
              onClick={() => { localStorage.removeItem(STORAGE_KEY); location.reload(); }}
              className="mono border border-[var(--line)] px-3 py-2 text-[10px] font-semibold tracking-widest text-[var(--muted)] hover:text-[var(--ink)]"
            >
              RESET
            </button>
          </div>
        </div>
        <div className="mt-3">
          <CoverageBar coverage={coverage} />
        </div>
      </header>

      {/* hero */}
      <section className="border-b border-[var(--line)] px-6 py-6">
        <div className="label mb-3 text-[var(--red)]">// problem statement</div>
        <h1 className="max-w-4xl text-[26px] font-bold leading-[1.25] tracking-tight md:text-[30px]">
          Every enterprise deal dies in a security questionnaire.{' '}
          <span className="text-[var(--red)]">Cross AI never guesses.</span>{' '}
          It reads your documents, cites the quote, and flags the contradiction.
        </h1>
        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
          <Stat n="21" label="docs.read" />
          <Stat n={all.length} label="questions" />
          <Stat n={s.verified ?? 0} label="verified" color="var(--green)" />
          <Stat n={s.conflict ?? 0} label="conflicts.caught" color="var(--red)" />
          <Stat n={s.unknown ?? 0} label="honest.gaps" color="var(--amber)" />
        </div>
      </section>

      {/* work area */}
      <div className="flex min-h-0 flex-1">
        <section className="flex w-[38%] min-w-[330px] flex-col border-r border-[var(--line)] bg-[var(--panel)]">
          <ChatPanel messages={messages} onSend={send} pending={pending} target={target} />
        </section>
        <section className="min-w-0 flex-1 bg-[#0a0a0e]">
          <QuestionnairePanel profile={profile} onPick={setTargetId} />
        </section>
      </div>
    </main>
  );
}
