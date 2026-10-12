import { useEffect, useRef, useState } from 'react';
import {
  MAX_HISTORY,
  MAX_RECORDING_MS,
  type ChatMessage,
  type ContextMessage,
  type Health,
  type Voice,
} from '../../../shared/contracts';
import { api } from '../lib/api';
import { openMicrophone, type Recording } from '../lib/recorder';
import { loadHistory, saveHistory } from '../lib/history';

export type Phase =
  'idle' | 'requesting' | 'recording' | 'transcribing' | 'thinking' | 'synthesizing' | 'speaking';
type Pending =
  | { stage: 'transcribe'; blob: Blob }
  | { stage: 'respond'; text: string; history: ContextMessage[] }
  | { stage: 'speak'; message: ChatMessage };
const makeMessage = (role: ChatMessage['role'], content: string, sample = false): ChatMessage => ({
  role,
  content,
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  sample,
});

export function useVoiceAgent() {
  const [initial] = useState(loadHistory);
  const [messages, setMessages] = useState(initial.messages);
  const messagesRef = useRef(messages);
  const [remember, setRemember] = useState(initial.remember);
  const [storageError, setStorageError] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [voice, setVoice] = useState<Voice>('coral');
  const [output, setOutput] = useState<'openai' | 'browser'>('openai');
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const recording = useRef<Recording | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pending = useRef<Pending | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const cachedAudio = useRef<{ id: string; voice: Voice; blob: Blob } | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const changePhase = (value: Phase) => {
    phaseRef.current = value;
    setPhase(value);
  };
  const updateMessages = (next: ChatMessage[]) => {
    messagesRef.current = next.slice(-100);
    setMessages(messagesRef.current);
  };
  const clearTimers = () => {
    clearTimeout(deadline.current);
    clearInterval(tick.current);
  };
  const stopPlayback = () => {
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current.src = '';
      audio.current = null;
    }
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
    }
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
      window.speechSynthesis?.cancel();
    }
    setActiveMessage(null);
  };
  const cancel = () => {
    generation.current++;
    abort.current?.abort();
    recording.current?.cancel();
    recording.current = null;
    clearTimers();
    stopPlayback();
    pending.current = null;
    setCanRetry(false);
    setLevel(0);
    changePhase('idle');
  };

  const checkHealth = async (signal?: AbortSignal) => {
    setHealthError(false);
    try {
      setHealth(await api.health(signal));
    } catch {
      if (!signal?.aborted) {
        setHealth(null);
        setHealthError(true);
      }
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal);
    return () => {
      controller.abort();
      cancel();
    };
    // Resource cleanup belongs to the hook lifetime, not each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setStorageError(!saveHistory(messages, remember));
  }, [messages, remember]);

  async function speak(message: ChatMessage, token: number, signal: AbortSignal) {
    pending.current = { stage: 'speak', message };
    const finished = () => {
      if (token !== generation.current) return;
      stopPlayback();
      pending.current = null;
      setCanRetry(false);
      changePhase('idle');
    };
    const failed = () => {
      if (token !== generation.current) return;
      stopPlayback();
      changePhase('idle');
      setError(
        'Audio could not play. Use Replay to try again, or choose Browser voice in settings.',
      );
      setCanRetry(true);
    };
    if (output === 'browser' || message.sample) {
      if (!('speechSynthesis' in window))
        throw new Error('Browser speech is not supported here. Choose OpenAI voice in settings.');
      const speech = new SpeechSynthesisUtterance(message.content);
      utterance.current = speech;
      speech.onend = finished;
      speech.onerror = failed;
      setActiveMessage(message.id);
      changePhase('speaking');
      window.speechSynthesis.speak(speech);
      return;
    }
    changePhase('synthesizing');
    const cached = cachedAudio.current;
    const blob =
      cached?.id === message.id && cached.voice === voice
        ? cached.blob
        : await api.speak(message.content, voice, signal);
    if (token !== generation.current) return;
    cachedAudio.current = { id: message.id, voice, blob };
    audioUrl.current = URL.createObjectURL(blob);
    const player = new Audio(audioUrl.current);
    audio.current = player;
    player.onended = finished;
    player.onerror = failed;
    try {
      await player.play();
      if (token === generation.current) {
        setActiveMessage(message.id);
        changePhase('speaking');
      }
    } catch {
      failed();
    }
  }
  async function run(start: Pending) {
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setCanRetry(false);
    pending.current = start;
    try {
      let step = start;
      if (step.stage === 'transcribe') {
        changePhase('transcribing');
        const text = await api.transcribe(step.blob, controller.signal);
        if (token !== generation.current) return;
        const prior = messagesRef.current.filter((m) => !m.sample);
        const history = prior.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
        updateMessages([...prior, makeMessage('user', text)]);
        step = { stage: 'respond', text, history };
        pending.current = step;
      }
      if (step.stage === 'respond') {
        changePhase('thinking');
        const text = await api.respond(step.text, step.history, controller.signal);
        if (token !== generation.current) return;
        const message = makeMessage('assistant', text);
        updateMessages([...messagesRef.current, message]);
        step = { stage: 'speak', message };
        pending.current = step;
      }
      await speak(step.message, token, controller.signal);
    } catch (failure) {
      if (token !== generation.current || controller.signal.aborted) return;
      setError(
        failure instanceof Error ? failure.message : 'Something went wrong. Please try again.',
      );
      setCanRetry(true);
      changePhase('idle');
    }
  }
  async function stopRecording() {
    const current = recording.current;
    if (!current || phaseRef.current !== 'recording') return;
    recording.current = null;
    clearTimers();
    changePhase('transcribing');
    const token = generation.current;
    try {
      const blob = await current.stop();
      if (token === generation.current) await run({ stage: 'transcribe', blob });
    } catch (failure) {
      if (token !== generation.current) return;
      setError(failure instanceof Error ? failure.message : 'Recording failed.');
      setCanRetry(false);
      changePhase('idle');
    }
  }
  async function startRecording() {
    if (phaseRef.current === 'requesting' || phaseRef.current === 'recording') return;
    cancel();
    setError(null);
    setSeconds(0);
    if (!health?.configured) {
      setError('Connect OpenAI on the server to start a live conversation.');
      return;
    }
    const token = generation.current;
    changePhase('requesting');
    try {
      const next = await openMicrophone((value) => {
        if (token === generation.current) setLevel(value);
      });
      // Permission prompts can outlive reset/unmount. Never resurrect the old session.
      if (token !== generation.current) {
        next.cancel();
        return;
      }
      recording.current = next;
      changePhase('recording');
      const started = Date.now();
      tick.current = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 200);
      deadline.current = setTimeout(() => void stopRecording(), MAX_RECORDING_MS);
    } catch (failure) {
      if (token !== generation.current) return;
      setError(failure instanceof Error ? failure.message : 'Could not access your microphone.');
      changePhase('idle');
    }
  }
  function reset() {
    cancel();
    setError(null);
    cachedAudio.current = null;
    updateMessages([]);
  }
  function replay(message: ChatMessage) {
    cancel();
    void run({ stage: 'speak', message });
  }
  function sample() {
    cancel();
    setError(null);
    updateMessages([
      makeMessage('user', 'I have a big idea, but I’m not sure where to start.', true),
      makeMessage(
        'assistant',
        'Let’s make it a little smaller. Imagine your idea is already out in the world. What’s the one thing you’d want it to help someone do?',
        true,
      ),
    ]);
  }
  return {
    phase,
    messages,
    health,
    healthError,
    error,
    canRetry,
    level,
    seconds,
    voice,
    setVoice,
    output,
    setOutput,
    remember,
    setRemember,
    storageError,
    activeMessage,
    startRecording,
    stopRecording,
    cancel,
    reset,
    replay,
    sample,
    checkHealth: () => checkHealth(),
    retry: () => {
      if (pending.current) void run(pending.current);
    },
    dismissError: () => setError(null),
  };
}
