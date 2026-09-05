'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// How the loop decides your turn is over. Security answers have pauses in them
// — someone reciting a control stops to think — so the silence window is
// deliberately longer than a chat app would use.
const SILENCE_MS = 1400;
const SPEECH_RMS = 0.015; // above the room, below a whisper
const MAX_TURN_MS = 30000;

/**
 * Voice for the transcript: speaking a reply aloud, and taking one in.
 *
 * Neither direction is allowed to become authoritative. Audio is played from a
 * reply that is already on screen with its citations under it, and a recording
 * only ever becomes the text a user would otherwise have typed — it re-enters
 * through the same /api/chat path, so intent classification and the evidence
 * rules in lib/ask.js are untouched by anything here.
 */
export function useVoice({ runId }) {
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false); // voice actually detected, not just armed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopMeterRef = useRef(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeakingIndex(null);
  }, []);

  /**
   * Speak one reply. Resolves when the audio finishes, so a caller running the
   * hands-free loop knows when it is its turn to listen again.
   */
  const play = useCallback(async (text, index = 0) => {
    stop();
    setError(null);
    if (!text?.trim()) return;
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, runId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `speak ${res.status}`);

      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      setSpeakingIndex(index);

      await new Promise((resolve) => {
        // Revoke on every exit path, or a long interview leaks a blob per reply.
        const done = () => {
          URL.revokeObjectURL(url);
          setSpeakingIndex((i) => (i === index ? null : i));
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = done; // barge-in, or the toggle going off mid-sentence
        audio.play().catch(done);
      });
    } catch (err) {
      setError(err.message);
      setSpeakingIndex(null);
    }
  }, [runId, stop]);

  /** Tear down mic + meter together; both leak if either is forgotten. */
  const releaseMic = useCallback(() => {
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setHearing(false);
    setRecording(false);
  }, []);

  /**
   * Open the mic and record until the speaker stops.
   *
   * `onSilence` is how the hands-free loop ends a turn without a click: an
   * analyser watches the level and fires once the room has been quiet for
   * SILENCE_MS *after* speech was actually heard. Waiting for speech first
   * matters — otherwise the turn ends instantly while someone is still
   * deciding what to say.
   */
  const startRecording = useCallback(async ({ onSilence } = {}) => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);

      if (onSilence) {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        let heardSpeech = false;
        let quietSince = null;
        const startedAt = Date.now();

        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          const rms = Math.sqrt(sum / buf.length);

          if (rms > SPEECH_RMS) {
            if (!heardSpeech) setHearing(true);
            heardSpeech = true;
            quietSince = null;
          } else if (heardSpeech) {
            quietSince ??= Date.now();
            if (Date.now() - quietSince > SILENCE_MS) return onSilence();
          }
          // A stuck-open mic is worse than a clipped sentence.
          if (Date.now() - startedAt > MAX_TURN_MS) onSilence();
        }, 100);

        stopMeterRef.current = () => { clearInterval(timer); ctx.close().catch(() => {}); };
      }
      return true;
    } catch (err) {
      // Almost always a denied mic permission, which is a normal thing for
      // someone to decide and not worth an alarming message.
      setError(err.name === 'NotAllowedError' ? 'microphone blocked' : err.message);
      setRecording(false);
      return false;
    }
  }, []);

  /** Close the mic and resolve with the transcript ('' if nothing was heard). */
  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') { releaseMic(); return ''; }
    setRecording(false);
    setBusy(true);

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      recorder.stop();
    });
    releaseMic();

    try {
      // Too short to be a sentence — usually a stray click. Don't spend a
      // transcription call, and don't report it as a failure.
      if (blob.size < 2000) return '';

      const form = new FormData();
      form.append('audio', blob, 'speech.webm');
      if (runId) form.append('runId', runId);
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `transcribe ${res.status}`);
      const { text } = await res.json();
      return text;
    } catch (err) {
      setError(err.message);
      return '';
    } finally {
      setBusy(false);
    }
  }, [runId, releaseMic]);

  // Leaving the page mid-sentence should not keep talking or hold the mic open.
  useEffect(() => () => { audioRef.current?.pause(); releaseMic(); }, [releaseMic]);

  return {
    play, stop, speakingIndex,
    startRecording, stopRecording, releaseMic,
    recording, hearing, busy, error, setError,
  };
}
