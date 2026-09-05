import { NextResponse, after } from 'next/server';
import { speak, voiceConfigured } from '@/lib/voice';
import { traceVoice } from '@/lib/prism';

/**
 * Speaks a reply the chat route already produced. It deliberately cannot be
 * asked to speak anything else about the corpus: text in, audio out, no model
 * consulted about what is true. The citations stay on screen where they can be
 * read — audio is the one channel where a quote cannot be checked, so it is
 * never the only place an answer appears.
 */
export async function POST(req) {
  if (!voiceConfigured()) {
    return NextResponse.json({ error: 'voice not configured' }, { status: 503 });
  }

  const started = Date.now();
  const { text, runId } = await req.json();
  const clean = (text ?? '').trim();
  if (!clean) return NextResponse.json({ error: 'text required' }, { status: 400 });

  try {
    const { audio, model, characters } = await speak(clean);

    after(() => {
      traceVoice({
        direction: 'tts',
        model,
        input: clean,
        output: `(${characters} characters spoken)`,
        latencyMs: Date.now() - started,
        runId: runId ?? 'interactive',
        metadata: { characters },
      });
    });

    return new Response(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    // A silent reply is a degraded demo, not a broken one. The answer is
    // already rendered; the client just does not get to play it.
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
