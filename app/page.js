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

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [targetId, setTargetId] = useState(null);

  useEffect(() => {
    // Always ask the server what run it is serving. A saved profile is only
    // reused if it came from that same corpus pass — otherwise a rebuild would
    // leave the browser showing yesterday's answers with no way to tell.
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
        const p = fresh;
        setProfile(p);
        const conflicts = p.openConflicts?.length ?? 0;
        const unknown = Object.values(p.answers).filter((a) => a.status === 'unknown').length;
        setMessages([
          {
            role: 'assistant',
            text:
              `I read Regodit's 21 documents and worked through all ${Object.keys(p.answers).length} questions before asking you anything.\n\n` +
              `${conflicts} of them are places where Regodit's own documents contradict each other. ${unknown} are genuine gaps I could not evidence.\n\n` +
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
    setMessages((m) => [...m, { role: 'user', text }]);
    setPending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, profile, currentQuestionId: targetId, history: messages.slice(-6) }),
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

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  if (!profile) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-slate-500">
        Reading Regodit&rsquo;s documents…
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mb-2 flex items-baseline gap-3">
          <h1 className="text-base font-semibold text-slate-900">Security questionnaire — Regodit</h1>
          <span className="text-xs text-slate-400">
            answered from their own documents · {coverage.total} questions
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={async () => {
                const res = await fetch('/api/questionnaire', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ profile }),
                });
                const w = window.open('', '_blank');
                w.document.write(await res.text());
                w.document.close();
              }}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
            >
              Generate questionnaire
            </button>
            <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
              reset
            </button>
          </div>
        </div>
        <CoverageBar coverage={coverage} />
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex w-[40%] min-w-[340px] flex-col border-r border-slate-200 bg-slate-50">
          <ChatPanel messages={messages} onSend={send} pending={pending} target={target} />
        </section>
        <section className="min-w-0 flex-1 bg-white">
          <QuestionnairePanel profile={profile} onPick={setTargetId} />
        </section>
      </div>
    </main>
  );
}
