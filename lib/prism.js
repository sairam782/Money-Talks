// PRISM tracing — ARCHITECTURE.md §8.
//   - header is X-PRISMtrace-Key, never Authorization: Bearer
//   - tracing must never break the app; every failure path swallows
//   - never awaited on the request path; call it inside after()

const HOST = process.env.PRISMTRACE_HOST ?? 'https://prism-api-prod.up.railway.app';
const KEY = process.env.PRISMTRACE_API_KEY;
const PROJECT_ID = process.env.PRISMTRACE_PROJECT_ID;

/** One interview = one session_id. It cannot be backfilled, so mint it once per run. */
export function newRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function emitTrace({ model, input, output, latencyMs = 0, sessionId, metadata = {} }) {
  if (!KEY || !PROJECT_ID) return { skipped: 'missing PRISM env vars' };

  const res = await fetch(`${HOST}/api/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PRISMtrace-Key': KEY },
    body: JSON.stringify({
      project_id: PROJECT_ID,
      model,
      input_messages: [{ role: 'user', content: input }],
      output_message: typeof output === 'string' ? output : JSON.stringify(output),
      latency_ms: latencyMs,
      session_id: sessionId,        // groups traces into one trajectory
      agent_id: 'security-analyst', // stable, or the dashboard splits it into many
      metadata,
    }),
  });
  if (!res.ok) throw new Error(`PRISM ingest ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

/** One trace per assessed question. Never awaited by callers. */
export function traceAnswer({ model, answer, latencyMs, runId }) {
  return emitTrace({
    model,
    input: `[${answer.num}] ${answer.questionText}`,
    output: answer.value ?? `(${answer.status})`,
    latencyMs,
    sessionId: runId,
    metadata: {
      questionId: answer.questionId,
      topic: answer.topic,
      status: answer.status,
      evidenceType: answer.evidence?.[0]?.evidenceType ?? null,
      citationCount: answer.evidence?.length ?? 0,
      rejectedCount: answer.rejectedEvidence?.length ?? 0,
      confidence: answer.confidence,
      hasConflict: Boolean(answer.conflict),
    },
  }).catch(() => {}); // tracing must never break the app
}
