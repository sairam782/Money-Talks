'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice for the transcript: speaking a reply aloud, and recording one.
 *
 * Both are conveniences over the existing text path and neither is allowed to
 * become authoritative. Audio is played from a reply that is already on screen
 * with its citations under it, and a recording becomes text in the input box
 * that the user still sends themselves — a mis-heard "we do not encrypt at
 * rest" must not be able to write itself into the profile as an answer.
 */
export function useVoice({ runId }) {
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeakingIndex(null);
  }, []);

  /** Speak one reply. `index` only identifies which bubble is lit up. */
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
      // Revoke on every exit path, or a long interview leaks a blob per reply.
      const done = () => { URL.revokeObjectURL(url); setSpeakingIndex((i) => (i === index ? null : i)); };
      audio.onended = done;
      audio.onerror = done;
      await audio.play();
    } catch (err) {
      setError(err.message);
      setSpeakingIndex(null);
    }
  }, [runId, stop]);

  /** Start recording. Resolves once the mic is actually live. */
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      // Almost always a denied mic permission, which is a normal thing for
      // someone to decide and not worth an alarming message.
      setError(err.name === 'NotAllowedError' ? 'microphone blocked' : err.message);
    }
  }, []);

  /** Stop recording and resolve with the transcript ('' if nothing was heard). */
  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return '';
    setRecording(false);
    setBusy(true);

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      recorder.stop();
    });
    // Let go of the mic, or the browser keeps showing the recording indicator.
    recorder.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;

    try {
      const form = new FormData();
      form.append('audio', blob, 'speech.webm');
      if (runId) form.append('runId', runId);
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `transcribe ${res.status}`);
      const { text } = await res.json();
      if (!text) setError('nothing heard');
      return text;
    } catch (err) {
      setError(err.message);
      return '';
    } finally {
      setBusy(false);
    }
  }, [runId]);

  // Leaving the page mid-sentence should not keep talking or keep the mic open.
  useEffect(() => () => {
    audioRef.current?.pause();
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
  }, []);

  return { play, stop, speakingIndex, startRecording, stopRecording, recording, busy, error };
}
