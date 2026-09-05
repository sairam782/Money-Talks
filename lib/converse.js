import { retrieve, passagesForPrompt } from './retrieve.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// The conversation runs on its own model. Groq meters tokens PER MODEL per day,
// so the interactive path cannot be starved by a corpus rebuild that exhausted
// the assess model's daily budget.
const MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b';

/**
 * The conversational turn.
 *
 * The interview is a conversation, not a form. A person may answer the question,
 * ask what the question means, challenge a finding, ask to move on, or just say
 * hello. Recording "hey" as a vendor's official answer to a security control is
 * worse than useless: it puts words in their mouth and it corrupts the profile.
 * So the model decides what the message IS before anything is written down.
 */
const SYSTEM = `You are a security analyst interviewing a vendor to complete their security
questionnaire. You have already read their documents and answered what you could. You are
now talking to a human about the questions you could not answer, and the places where their
documents contradict each other.

Classify what the person just said, then reply as a person would.

intent:
- "answer"      they are substantively answering the question on the table
- "clarify"     they are asking what the question means, or why you are asking
- "challenge"   they dispute your finding or want to see your evidence
- "skip"        they want to move on, or say they do not know
- "smalltalk"   greeting, thanks, "what is this", or anything not about the question
- "meta"        they are asking about the tool, your progress, or the process
- "ask"         they are asking a factual question ABOUT REGODIT that is not the question
                on the table — about a control, a document, a person, a finding, anything
                in their security posture. This includes questions the questionnaire never
                asked. Do NOT try to answer it yourself: set intent "ask" and leave "reply"
                empty. Someone else looks it up in the documents and answers with citations.

RULES:
- YOU ARE THE INTERVIEWER. You ask; they answer. Never compose an answer on the vendor's
  behalf and never narrate what their documents say as though they had just told you. If
  they give you a short answer, your reply is the NEXT QUESTION, not a summary.
- When their message is short ("yes", "no", "daily", "we do"), your entire reply should be
  one short question. Do not restate what they said back to them.
- Record an answer ONLY for intent "answer". Anything else records nothing.
- "hey", "hello", "ok", "thanks" are NEVER answers. They are smalltalk.
- "what is this?", "who are you?", "how does this work?" are "meta": they are asking about
  THIS TOOL, not about the passages. Explain what you are doing in one or two sentences.
- A question about REGODIT is "ask", never "meta" and never "answer". "Do you enforce MFA?",
  "who has admin access?", "what does the pentest say?", "how long do you keep logs?" are
  all "ask" — the person is querying the documents, not answering your question. Recording
  a question as though it were their answer corrupts the record, so when in doubt between
  "answer" and "ask": a sentence ending in "?" is an "ask".
- A one-word "yes" or "no" IS an answer, but it is never a complete one. Ask ONE specific
  closed follow-up, not an open-ended "tell me about it". Drill down in this order, and ask
  only for the next thing you are still missing:
      1. HOW OFTEN  -> "How frequently?"
      2. AUTOMATED  -> "Is that automated or manual?"
      3. TESTED     -> "When was it last tested, and was the restore verified?"
      4. OWNER      -> "Who is responsible for it?"
  Worked example:
      You: Do you perform backups?      Them: Yes
      You: How frequently?              Them: Daily
      You: Are they automated?          Them: Yes
      You: When did you last test a restore?
  Stop drilling once you have frequency, automation and testing. Then set moveOn true.
  Track what they have ALREADY told you in this conversation and never re-ask it.
- Keep each follow-up to a single sentence. Do not stack three questions into one.
- Be brief. Two or three sentences. You are talking, not writing a report.
- Never invent facts about the company. If you cite anything, quote the passages given.
- If the question on the table is a conflict, explain both sides plainly before asking
  them to rule on it.

Reply with JSON only:
{
  "intent": "...",
  "isAnswer": true | false,
  "reply": "what you say to them",
  "followUpQuestion": "the specific detail still missing, or null",
  "moveOn": true | false
}`;

export async function converse({ message, question, profile, history = [] }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return fallback(message, question);

  // Retrieve against BOTH the open question and what they actually typed. Keying
  // retrieval on the question alone meant a person who asked about anything else
  // got a model with no passages about it in front of them — which is exactly
  // the condition under which a model invents an answer.
  const onQuestion = question
    ? retrieve(question.questionText ?? question.text, { limit: 8, charBudget: 2000 })
    : [];
  const onMessage = message?.trim() ? retrieve(message, { limit: 6, charBudget: 1500 }) : [];
  const seen = new Set();
  const passages = [...onQuestion, ...onMessage].filter((p) => {
    const k = `${p.docId}:${p.text.slice(0, 60)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const context = question
    ? `THE QUESTION ON THE TABLE:
${question.num} — ${question.questionText ?? question.text}
Its current state: ${question.status}${question.value ? `\nWhat we have so far: ${question.value}` : ''}${
        question.conflict
          ? `\nCONFLICT — the documents disagree:\n` +
            question.conflict.sources.map((s) => `  [${s.evidenceType}] ${s.docName}: "${s.quote}"`).join('\n')
          : ''
      }

RELEVANT PASSAGES FROM THEIR DOCUMENTS:
${passagesForPrompt(passages)}`
    : `There is no question on the table right now.

RELEVANT PASSAGES FROM THEIR DOCUMENTS:
${passagesForPrompt(passages)}`;

  const progress = summarise(profile);

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        // gpt-oss is a reasoning model: it spends completion tokens thinking
        // before it writes anything. At 500 it burned the whole budget on
        // reasoning and returned an empty string, which silently fell back.
        max_tokens: 2500,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'system', content: `PROGRESS SO FAR: ${progress}` },
          ...history.slice(-6).map((m) => ({ role: m.role, content: m.text })),
          { role: 'user', content: `${context}\n\nTHEY SAID: ${message}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error('[converse] groq', res.status, (await res.text()).slice(0, 200));
      return fallback(message, question);
    }
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? '';
    if (!raw.trim()) {
      console.error('[converse] empty content, finish_reason=', json.choices?.[0]?.finish_reason);
      return fallback(message, question);
    }
    const out = JSON.parse(raw);
    const reply = String(out.reply ?? '').trim();
    return {
      intent: out.intent ?? 'smalltalk',
      // A question is not an answer. Guarding here as well as in the prompt,
      // because this is the failure that silently corrupts the profile.
      isAnswer: Boolean(out.isAnswer) && out.intent === 'answer',
      reply: reply || defaultReply(out.intent, question),
      followUpQuestion: out.followUpQuestion ?? null,
      moveOn: Boolean(out.moveOn),
      usage: json.usage ?? null,
    };
  } catch (err) {
    console.error('[converse]', String(err).slice(0, 200));
    return fallback(message, question);
  }
}

/** A model that returns an empty string still has to say something. */
function defaultReply(intent, question) {
  const q = question ? `${question.num} — ${question.questionText ?? question.text}` : null;
  if (intent === 'answer') return q ? `Got it, recorded against ${question.num}.` : 'Recorded.';
  if (intent === 'meta' || intent === 'clarify')
    return `I'm completing Regodit's security questionnaire from their own documents — I answered what the documents support and I'm asking you about the rest.${q ? ` Right now: ${q}` : ''}`;
  return q ? `Ready when you are. We're on ${q}` : 'Ready when you are.';
}

function summarise(profile) {
  const all = Object.values(profile?.answers ?? {});
  const c = {};
  for (const a of all) c[a.status] = (c[a.status] ?? 0) + 1;
  return `${all.length} questions — ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')}`;
}

/** If the model is unreachable, still refuse to record a greeting as an answer. */
function fallback(message, question) {
  const trivial = /^(hi|hey|hello|yo|sup|ok|okay|thanks|ta|what is this\??|who are you\??)$/i;
  const m = message.trim();
  // Without the model we cannot classify, but we can still refuse the one
  // mistake that corrupts the record: writing a question down as an answer.
  if (m.endsWith('?')) {
    return { intent: 'ask', isAnswer: false, reply: '', followUpQuestion: null, moveOn: false, usage: null };
  }
  const isAnswer = !trivial.test(m) && m.length > 3;
  return {
    intent: isAnswer ? 'answer' : 'smalltalk',
    isAnswer,
    reply: isAnswer
      ? `Recorded against ${question?.num ?? 'that question'}.`
      : `I'm completing Regodit's security questionnaire from their documents. ${
          question ? `Right now I'm on ${question.num}: ${question.questionText ?? question.text}` : ''
        }`,
    followUpQuestion: null,
    moveOn: false,
    usage: null,
  };
}
