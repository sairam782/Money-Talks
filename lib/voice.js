// ElevenLabs voice — speech out (TTS) and speech in (STT).
//
// Voice is a RENDERING of an answer, never a second source of one. Nothing in
// this file decides what is true: `speak` is handed the reply that
// app/api/chat/route.js already produced under the citation rule, and
// `transcribe` only turns a recording into the text the user would otherwise
// have typed. The evidence discipline in lib/ask.js and lib/corpus.js is
// untouched by both, which is exactly why voice can be added without weakening
// it.

const TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

// ELEVEN_LABS is the name the key already sits under in .env.local; the
// canonical name is accepted too so a fresh deployment can use either.
const KEY = process.env.ELEVENLABS_API_KEY ?? process.env.ELEVEN_LABS;
// Flash is the cheapest and lowest-latency voice model. The demo speaks short
// analyst replies, not audiobooks, so quality past this is paid for in seconds
// of dead air.
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5';
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL ?? 'scribe_v1';
// "Rachel" — a stock ElevenLabs voice, so the demo runs on a fresh account with
// no voice set up. Override to use your own.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';

export function voiceConfigured() {
  return Boolean(KEY);
}

/**
 * Text in, MP3 bytes out. Throws on failure — the caller decides whether a
 * missing voice is worth surfacing, and in this app it never is: the answer is
 * already on screen, so audio failing is a downgrade, not an error.
 */
export async function speak(text) {
  if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set');

  const res = await fetch(`${TTS_URL}/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: { stability: 0.4, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return { audio: await res.arrayBuffer(), model: TTS_MODEL, characters: text.length };
}

/**
 * A recording in, the words out. Returns the transcript only — it is fed into
 * the same send() path a typed message uses, so intent classification and
 * recording stay in lib/converse.js where they already are.
 */
export async function transcribe(file) {
  if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set');

  const form = new FormData();
  form.append('file', file);
  form.append('model_id', STT_MODEL);

  const res = await fetch(STT_URL, { method: 'POST', headers: { 'xi-api-key': KEY }, body: form });

  if (!res.ok) {
    throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return { text: (data.text ?? '').trim(), model: STT_MODEL, language: data.language_code ?? null };
}
