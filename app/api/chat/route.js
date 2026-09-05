import { NextResponse, after } from 'next/server';
import { recordUserAnswer, nextOpenQuestion, coverage } from '@/lib/profile';
import { traceAnswer } from '@/lib/prism';

const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

/**
 * The server is a pure function: profile in, profile out. Nothing is stored
 * here, because serverless instances do not share memory (ARCHITECTURE.md §3).
 */
export async function POST(req) {
  const started = Date.now();
  const { message, profile, currentQuestionId } = await req.json();

  if (!profile?.answers) {
    return NextResponse.json({ error: 'profile required' }, { status: 400 });
  }

  const target = currentQuestionId ?? nextOpenQuestion(profile)?.questionId;
  if (!target) {
    return NextResponse.json({
      reply: 'Every question has been dealt with. You can generate the completed questionnaire now.',
      profile,
      action: 'complete',
      evidence: [],
    });
  }

  const prev = profile.answers[target];
  const wasConflict = prev?.status === 'conflict';
  const { profile: updated, action } = recordUserAnswer(profile, target, message, {
    resolvesConflict: wasConflict,
  });

  const next = nextOpenQuestion(updated);
  const cov = coverage(updated);

  const reply = wasConflict
    ? `Recorded. I've marked ${prev.num} as ruled by you, and kept both original sources in its history.` +
      (next ? `\n\nNext: ${next.num} — ${next.followUpQuestion ?? next.questionText}` : '')
    : `Recorded against ${prev.num}.` +
      (next ? `\n\nNext: ${next.num} — ${next.followUpQuestion ?? next.questionText}` : '');

  // Tracing is fire-and-forget and never blocks the response.
  after(() => {
    traceAnswer({
      model: MODEL,
      answer: { ...updated.answers[target], questionText: prev.questionText },
      latencyMs: Date.now() - started,
      runId: profile.runId ?? 'interactive',
    });
  });

  return NextResponse.json({
    reply,
    profile: updated,
    action,
    coverage: cov,
    nextQuestionId: next?.questionId ?? null,
    evidence: updated.answers[target].evidence,
  });
}
