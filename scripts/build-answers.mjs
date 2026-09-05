/**
 * One full pass over the questionnaire, cached to data/answers.json.
 *
 * Groq's free tier allows ~200k tokens/day and this run costs ~90k, so we get
 * roughly two full runs in a day. The cache is what stops the demo depending on
 * a live API call — and on the rate limit — while judges are watching.
 */
import fs from 'fs';
import { TOPIC_BATCHES } from '../lib/questionnaire.js';
import { assessTopic } from '../lib/assess.js';
import { traceAnswer, newRunId } from '../lib/prism.js';

const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
const runId = newRunId();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const all = [];
let tokensIn = 0;
let tokensOut = 0;
let traced = 0;

console.log(`run ${runId} — ${TOPIC_BATCHES.length} topics, model ${MODEL}\n`);

for (const [i, batch] of TOPIC_BATCHES.entries()) {
  const t0 = Date.now();
  const res = await assessTopic(batch.topic, batch.questions);
  tokensIn += res.usage?.prompt_tokens ?? 0;
  tokensOut += res.usage?.completion_tokens ?? 0;

  const tally = {};
  for (const a of res.answers) tally[a.status] = (tally[a.status] ?? 0) + 1;
  const conflicts = res.answers.filter((a) => a.conflict).length;

  console.log(
    `[${String(i + 1).padStart(2)}/${TOPIC_BATCHES.length}] ${batch.topic.padEnd(38)} ` +
      `${String(Date.now() - t0).padStart(6)}ms  ` +
      Object.entries(tally).map(([k, v]) => `${k}:${v}`).join(' ').padEnd(42) +
      (conflicts ? `  ⚑${conflicts}` : '') +
      (res.error ? `  ERROR ${res.error.slice(0, 80)}` : '')
  );

  for (const a of res.answers) {
    all.push(a);
    traceAnswer({ model: MODEL, answer: a, latencyMs: res.latencyMs, runId });
    traced++;
  }

  // 8000 tokens/minute. Pace deliberately rather than absorbing 429s.
  if (i < TOPIC_BATCHES.length - 1) await sleep(48000);
}

const tally = {};
for (const a of all) tally[a.status] = (tally[a.status] ?? 0) + 1;

fs.writeFileSync(
  'data/answers.json',
  JSON.stringify({ runId, model: MODEL, generatedAt: new Date().toISOString(), answers: all }, null, 1)
);

console.log(`\n${all.length} answers cached to data/answers.json`);
console.log('states     :', tally);
console.log('conflicts  :', all.filter((a) => a.conflict).length);
console.log('tokens     :', tokensIn, 'in /', tokensOut, 'out');
console.log('traced     :', traced, 'to PRISM, session', runId);
await sleep(3000); // let the fire-and-forget traces land before exit
