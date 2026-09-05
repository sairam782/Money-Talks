'use client';
import { useEffect, useState, useMemo } from 'react';
import ChatPanel from '@/components/ChatPanel';
import QuestionnairePanel from '@/components/QuestionnairePanel';
import OverviewPanel from '@/components/OverviewPanel';
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
    <div className="flex items-baseline gap-1.5">
      <span className="text-[15px] font-bold leading-none tabular-nums" style={{ color: color ?? 'var(--ink)' }}>
        {n}
      </span>
      <span className="label">{label}</span>
    </div>
  );
}

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [targetId, setTargetId] = useState(null);
  const [view, setView] = useState('overview');

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
              `${unknown} I could not evidence from your documents — those need your confirmation.\n\n` +
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
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: data.reply ?? 'Recorded.',
          // A free-form answer shows its sources in the transcript. An answer
          // about their security posture with no citation under it looks
          // exactly like one that was made up — so it never appears bare.
          evidence: data.intent === 'ask' ? data.evidence ?? [] : [],
          status: data.intent === 'ask' ? data.status : null,
        },
      ]);
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
  const s_ = coverage.states;
  const conflictCount = all.filter((a) => a.conflict).length;

  return (
    <main className="flex h-screen flex-col">
      {/* one header. identity, state, actions. nothing else. */}
      <header className="border-b border-[var(--line)] bg-[var(--panel)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="grid h-7 w-7 shrink-0 place-items-center bg-[var(--red-deep)] text-[13px] font-black text-white">
            X
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold leading-none tracking-tight">CROSS AI</div>
            <div className="label mt-1 truncate">regodit · vendor security questionnaire</div>
          </div>

          <div className="ml-auto flex items-center gap-5">
            <div className="hidden items-center gap-5 sm:flex">
              <Stat n={s_.verified ?? 0} label="verified" color="var(--green)" />
              <Stat n={s_.conflict ?? 0} label="conflicts" color="var(--red)" />
              <Stat n={s_.unknown ?? 0} label="to confirm" color="var(--amber)" />
            </div>
            <a
              href="/questionnaire"
              className="mono bg-[var(--red-deep)] px-3 py-1.5 text-[10px] font-bold tracking-widest text-white hover:bg-[#b91c1c]"
            >
              GENERATE ▸
            </a>
            <button
              onClick={() => { localStorage.removeItem(STORAGE_KEY); location.reload(); }}
              className="mono text-[10px] tracking-widest text-[var(--dim)] hover:text-[var(--ink)]"
            >
              RESET
            </button>
          </div>
        </div>

        <div className="mt-3">
          <CoverageBar coverage={coverage} />
        </div>
      </header>

      {/* work area */}
      <div className="flex min-h-0 flex-1">
        <section className="flex w-[38%] min-w-[330px] flex-col border-r border-[var(--line)] bg-[var(--panel)]">
          <ChatPanel messages={messages} onSend={send} pending={pending} target={target} />
        </section>
        <section className="flex min-w-0 flex-1 flex-col bg-[#0a0a0e]">
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--line)] bg-[var(--panel)] px-3">
            {[
              { id: 'overview',      label: 'OVERVIEW' },
              { id: 'conflicts',     label: `CONFLICTS (${conflictCount})` },
              { id: 'questionnaire', label: 'QUESTIONNAIRE' },
              { id: 'open',          label: `TO CONFIRM (${s_.unknown ?? 0})` },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`mono border-b-2 px-3 py-2 text-[10px] font-semibold tracking-widest transition-colors ${
                  view === t.id
                    ? 'border-[var(--red-deep)] text-[var(--ink)]'
                    : 'border-transparent text-[var(--dim)] hover:text-[var(--muted)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1">
            {view === 'overview' ? (
              <OverviewPanel
                profile={profile}
                onPick={(id) => { setTargetId(id); setView('conflicts'); }}
                onSeeConflicts={() => setView('conflicts')}
              />
            ) : (
              <QuestionnairePanel
                profile={profile}
                onPick={setTargetId}
                only={view === 'conflicts' ? 'conflict' : view === 'open' ? 'open' : null}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
