import { NextResponse, after } from 'next/server';
import { recordUserAnswer, nextOpenQuestion, coverage } from '@/lib/profile';
import { converse } from '@/lib/converse';
import { askCorpus } from '@/lib/ask';
import { traceAnswer, traceAsk } from '@/lib/prism';

const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

/**
 * The server is a pure function: profile in, profile out. Nothing is stored
 * here, because serverless instances do not share memory (ARCHITECTURE.md §3).
 */
export async function POST(req) {
  const started = Date.now();
  const { message, profile, currentQuestionId, history = [] } = await req.json();

  if (!profile?.answers) {
    return NextResponse.json({ error: 'profile required' }, { status: 400 });
  }

  const targetId = currentQuestionId ?? nextOpenQuestion(profile)?.questionId ?? null;
  const question = targetId ? profile.answers[targetId] : null;

  // Work out what they actually said BEFORE writing anything down.
  const turn = await converse({ message, question, profile, history });

  /**
   * They asked us something instead of answering — and it does not have to be
   * one of the 66. The questionnaire is the deliverable, not the limit of what
   * the corpus can be asked. Look it up under the same rule as everything else:
   * verbatim citation or no answer. Nothing is recorded against the open
   * question, and the question stays on the table.
   */
  if (turn.intent === 'ask') {
    const found = await askCorpus(message);

    after(() => {
      traceAsk({ question: message, result: found, runId: profile.runId ?? 'interactive' });
    });

    return NextResponse.json({
      reply: found.answer,
      profile,
      action: 'ask',
      recorded: false,
      intent: 'ask',
      status: found.status,
      coverage: coverage(profile),
      nextQuestionId: targetId,
      evidence: found.evidence,
      followUpQuestion: found.followUpQuestion,
    });
  }

  // Not an answer — reply, record nothing, leave the question where it was.
  if (!turn.isAnswer || !question) {
    return NextResponse.json({
      reply: turn.reply,
      profile,
      action: turn.intent,
      recorded: false,
      coverage: coverage(profile),
      nextQuestionId: turn.moveOn ? nextOpenQuestion(profile)?.questionId ?? null : targetId,
      evidence: question?.evidence ?? [],
    });
  }

  const wasConflict = question.status === 'conflict';
  const { profile: updated } = recordUserAnswer(profile, targetId, message, {
    resolvesConflict: wasConflict,
  });

  // A "yes" is not a complete answer. Stay on the question if a detail is missing.
  const stay = Boolean(turn.followUpQuestion) && !turn.moveOn;
  if (stay) updated.answers[targetId].followUpQuestion = turn.followUpQuestion;
  const next = stay ? question : nextOpenQuestion(updated);

  after(() => {
    traceAnswer({
      model: MODEL,
      answer: { ...updated.answers[targetId], questionText: question.questionText },
      latencyMs: Date.now() - started,
      runId: profile.runId ?? 'interactive',
    });
  });

  return NextResponse.json({
    reply: turn.reply,
    profile: updated,
    action: wasConflict ? 'recorded_correction' : 'answered',
    recorded: true,
    intent: turn.intent,
    coverage: coverage(updated),
    nextQuestionId: next?.questionId ?? targetId,
    evidence: updated.answers[targetId].evidence,
  });
}
