'use client';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'regodit-profile-v1';

/**
 * The completed questionnaire, at its own URL.
 *
 * This used to open in a popup, which browsers blocked — the button appeared to
 * do nothing. A real route always works, and it gives the deliverable an address
 * you can put on screen.
 */
export default function QuestionnairePage() {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const profile = saved ? JSON.parse(saved) : null;
    fetch('/api/questionnaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    })
      .then((r) => r.text())
      .then(setHtml)
      .catch((e) => setError(String(e)));
  }, []);

  function download() {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Regodit-security-questionnaire.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-2.5">
        <a href="/" className="mono text-[10px] tracking-widest text-[var(--muted)] hover:text-[var(--ink)]">&larr; BACK TO INTERVIEW</a>
        <span className="mono text-[10px] tracking-widest text-[var(--ink)]">COMPLETED QUESTIONNAIRE</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => window.print()}
            disabled={!html}
            className="mono border border-[var(--line)] px-3 py-1.5 text-[10px] font-semibold tracking-widest text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-30"
          >
            PRINT / PDF
          </button>
          <button
            onClick={download}
            disabled={!html}
            className="mono bg-[var(--red-deep)] px-3 py-1.5 text-[10px] font-bold tracking-widest text-white disabled:opacity-30"
          >
            Download
          </button>
        </div>
      </header>
      {error && <p className="mono p-6 text-[11px] text-[var(--red)]">COULD NOT GENERATE: {error}</p>}
      {!html && !error && <p className="mono p-6 text-[11px] tracking-widest text-[var(--muted)]">GENERATING…</p>}
      {html && <iframe srcDoc={html} title="Completed questionnaire" className="min-h-0 flex-1 bg-white" />}
    </main>
  );
}
