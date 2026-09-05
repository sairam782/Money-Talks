import { NextResponse, after } from 'next/server';
import { transcribe, voiceConfigured } from '@/lib/voice';
import { traceVoice } from '@/lib/prism';

/**
 * Turns a recording into text and stops there. It does NOT answer, record, or
 * classify — the transcript goes back to the client and is sent through the
 * ordinary /api/chat path, so a spoken answer is subject to exactly the same
 * intent classification and evidence rules as a typed one. Speech is an input
 * method, not a shortcut past the discipline.
 */
export async function POST(req) {
  if (!voiceConfigured()) {
    return NextResponse.json({ error: 'voice not configured' }, { status: 503 });
  }

  const started = Date.now();
  const form = await req.formData();
  const file = form.get('audio');
  const runId = form.get('runId');
  if (!file) return NextResponse.json({ error: 'audio required' }, { status: 400 });

  try {
    const { text, model, language } = await transcribe(file);

    after(() => {
      traceVoice({
        direction: 'stt',
        model,
        input: `(recording, ${file.size} bytes)`,
        output: text || '(nothing heard)',
        latencyMs: Date.now() - started,
        runId: runId ?? 'interactive',
        metadata: { bytes: file.size, language, empty: !text },
      });
    });

    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
