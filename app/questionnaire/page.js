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
    <main className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
        <a href="/" className="text-sm text-slate-500 hover:text-slate-800">&larr; Back to the interview</a>
        <span className="text-sm font-medium text-slate-800">Completed questionnaire</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => window.print()}
            disabled={!html}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Print / PDF
          </button>
          <button
            onClick={download}
            disabled={!html}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Download
          </button>
        </div>
      </header>
      {error && <p className="p-6 text-sm text-rose-700">Could not generate: {error}</p>}
      {!html && !error && <p className="p-6 text-sm text-slate-500">Generating…</p>}
      {html && <iframe srcDoc={html} title="Completed questionnaire" className="min-h-0 flex-1 bg-white" />}
    </main>
  );
}
