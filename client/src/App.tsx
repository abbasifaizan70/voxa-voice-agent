import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Headphones,
  LoaderCircle,
  Mic,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useVoiceAgent, type Phase } from './hooks/useVoiceAgent';
import { VoiceOrb } from './components/VoiceOrb';
import { Settings } from './components/Settings';
import { Transcript } from './components/Transcript';

const phaseLabels: Record<Phase, string> = {
  idle: 'Ready when you are',
  requesting: 'Allow microphone access',
  recording: 'Listening to you',
  transcribing: 'Finding your words',
  thinking: 'A moment to think',
  synthesizing: 'Finding my voice',
  speaking: 'Voxa is speaking',
};

export default function App() {
  const agent = useVoiceAgent();
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const busy = !['idle', 'recording', 'speaking'].includes(agent.phase);
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [help]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        settings ||
        help ||
        (event.target as HTMLElement).closest('button, input, select, textarea, a')
      )
        return;
      event.preventDefault();
      if (agent.phase === 'recording') void agent.stopRecording();
      else if (agent.phase === 'idle' || agent.phase === 'speaking') void agent.startRecording();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [agent, settings, help]);
  const primaryLabel =
    agent.phase === 'recording'
      ? 'Finish speaking'
      : agent.phase === 'speaking'
        ? 'Interrupt & speak'
        : agent.messages.some((m) => !m.sample)
          ? 'Keep talking'
          : 'Start talking';
  return (
    <div className="mx-auto min-h-screen max-w-[1600px] px-5 sm:px-10 lg:px-16">
      <header className="flex h-24 items-center justify-between border-b border-line">
        <a href="/" aria-label="Voxa home" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-forest text-lime">
            <AudioLines size={21} strokeWidth={1.8} />
          </span>
          <span className="text-[27px] font-semibold tracking-[-1.2px]">
            voxa<span className="text-forest/50">.</span>
          </span>
        </a>
        <div className="flex items-center gap-3 sm:gap-6">
          <span className="hidden items-center gap-2 text-[11px] text-muted sm:flex">
            <span
              className={`size-1.5 rounded-full ${agent.health?.configured ? 'bg-emerald-600' : 'bg-amber-500'}`}
            />
            {agent.health?.configured
              ? 'Ready to connect'
              : agent.healthError
                ? 'Server offline'
                : agent.health
                  ? 'Setup needed'
                  : 'Connecting…'}
          </span>
          <div className="h-4 w-px bg-line" />
          <button
            onClick={() => setHelp(true)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted hover:bg-white"
          >
            <CircleHelp size={16} />
            <span className="hidden sm:inline">How it works</span>
          </button>
          <button
            onClick={() => setSettings(true)}
            aria-label="Open voice settings"
            title="Voice settings"
            className="rounded-lg border border-line bg-white p-2.5 text-muted hover:border-forest/30"
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>

      <main className="py-9 sm:py-11">
        <div className="mb-9 flex items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[2px] text-muted">
              <span className="h-px w-5 bg-forest/40" />
              YOUR VOICE, A LITTLE POSSIBILITY
            </div>
            <h1 className="font-display text-[35px] leading-tight tracking-[-1.3px] sm:text-[44px]">
              A little space to think out loud.
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-muted sm:text-sm">
              An idea, a question, or just a conversation. Let’s talk it through.
            </p>
          </div>
          <span className="mb-2 hidden items-center gap-2 rounded-full border border-line bg-white/60 px-3 py-2 text-[10px] text-muted lg:flex">
            <Headphones size={13} /> Better with headphones
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] xl:gap-8">
          <section
            aria-label="Voice workspace"
            className="relative flex min-h-[565px] flex-col items-center overflow-hidden rounded-[26px] border border-line bg-[#eef2e9] px-5 pb-7 pt-6 lg:h-[615px]"
          >
            <div className="absolute -left-24 top-10 size-80 rounded-full bg-white/40 blur-3xl" />
            <div className="relative flex w-full items-center justify-between">
              <span className="flex items-center gap-1.5 rounded-full border border-forest/10 bg-white/55 px-2.5 py-1.5 text-[10px] font-medium text-forest">
                <AudioLines size={12} /> VOICE SPACE
              </span>
              <button
                onClick={() => setSettings(true)}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-forest"
              >
                {agent.output === 'browser'
                  ? 'Browser voice'
                  : `${agent.voice[0].toUpperCase()}${agent.voice.slice(1)} voice`}
                <ChevronRight size={12} />
              </button>
            </div>
            <div className="relative mt-3">
              <VoiceOrb phase={agent.phase} level={agent.level} />
            </div>
            <div className="relative -mt-1 text-center" role="status" aria-live="polite">
              <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-medium tracking-widest text-muted">
                <span
                  className={`size-1.5 rounded-full ${agent.phase === 'recording' ? 'animate-pulse bg-red-500' : 'bg-forest/50'}`}
                />
                {agent.phase === 'recording'
                  ? `${String(Math.floor(agent.seconds / 60)).padStart(2, '0')}:${String(agent.seconds % 60).padStart(2, '0')} / 01:00`
                  : 'JUST YOU & VOXA'}
              </div>
              <h2 className="font-display text-[27px] tracking-tight">
                {phaseLabels[agent.phase]}
              </h2>
              <p className="mt-2 max-w-xs text-xs leading-5 text-muted">
                {agent.phase === 'recording'
                  ? 'Take your time. Tap below when you’re done.'
                  : agent.phase === 'speaking'
                    ? 'Jump in whenever a new thought comes to you.'
                    : busy
                      ? 'Stay right here. We’ll keep the conversation going.'
                      : prompt
                        ? `Try saying: “${prompt}”`
                        : 'No perfect words needed. Just press play on a thought.'}
              </p>
            </div>
            <div className="relative mt-6 flex items-center gap-3">
              <button
                onClick={() =>
                  agent.phase === 'recording'
                    ? void agent.stopRecording()
                    : void agent.startRecording()
                }
                disabled={busy || !agent.health?.configured}
                className={`flex min-w-44 items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-[13px] font-medium text-white shadow-sm transition hover:shadow-md disabled:opacity-45 ${agent.phase === 'recording' ? 'bg-[#934b3e] hover:bg-[#7e3c30]' : 'bg-forest hover:bg-[#103f38]'}`}
              >
                {busy ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : agent.phase === 'recording' ? (
                  <Square size={15} fill="currentColor" />
                ) : (
                  <Mic size={17} />
                )}{' '}
                {busy ? 'One moment…' : primaryLabel}
              </button>
              {agent.phase !== 'idle' && (
                <button
                  onClick={agent.cancel}
                  aria-label="Cancel current activity"
                  title="Cancel current activity"
                  className="rounded-full border border-line bg-white p-3.5 text-muted hover:text-ink"
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <p className="relative mt-3 text-[10px] text-muted">
              {agent.phase === 'recording' ? (
                'Stops automatically after 60 seconds'
              ) : (
                <span>
                  or press{' '}
                  <kbd className="mx-1 rounded border border-forest/15 bg-white/60 px-1.5 py-0.5 font-sans text-[9px]">
                    space
                  </kbd>{' '}
                  to {agent.phase === 'speaking' ? 'interrupt' : 'start'}
                </span>
              )}
            </p>
            <div className="relative mt-auto flex w-full items-center justify-center gap-1.5 pt-7 text-[10px] text-muted">
              <ShieldCheck size={13} />
              <span>Noise reduction requested</span>
              <span className="mx-2 text-forest/20">|</span>
              <span>AI-generated voice</span>
            </div>
          </section>
          <Transcript
            messages={agent.messages}
            phase={agent.phase}
            activeMessage={agent.activeMessage}
            onReplay={agent.replay}
            onStop={agent.cancel}
            onReset={agent.reset}
            onSample={agent.sample}
          />
        </div>

        {agent.error && (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-xs text-red-900"
          >
            <p className="flex-1 leading-5">{agent.error}</p>
            <div className="flex items-center gap-3">
              {agent.canRetry && (
                <button
                  onClick={agent.retry}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 font-semibold"
                >
                  <RotateCcw size={12} />
                  Retry
                </button>
              )}
              <button
                onClick={agent.dismissError}
                aria-label="Dismiss error"
                className="rounded p-1"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {((agent.health && !agent.health.configured) || agent.healthError) && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dedccc] bg-[#f2f0e5] px-5 py-4 text-xs">
            <p className="leading-5">
              <span className="font-semibold">
                {agent.healthError
                  ? 'The server is not reachable.'
                  : 'Your voice space is almost ready.'}
              </span>{' '}
              {agent.healthError ? (
                'Start the Node server, then check the connection.'
              ) : (
                <>
                  Add <code className="text-[11px]">OPENAI_API_KEY</code> to the server’s{' '}
                  <code>.env</code> and restart. You can preview a sample now.
                </>
              )}
            </p>
            <button
              onClick={() => void agent.checkHealth()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-forest"
            >
              <RotateCcw size={12} />
              Check connection
            </button>
          </div>
        )}

        <section
          aria-label="Conversation inspiration"
          className="mt-8 grid gap-4 sm:grid-cols-[1fr_3fr]"
        >
          <div className="pt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold">
              <Sparkles size={13} /> A starting point
            </p>
            <p className="mt-1.5 text-[11px] text-muted">A little inspiration, if you need it.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Untangle an idea', 'Help me think through an idea.'],
              ['Learn something new', 'Explain something fascinating to me.'],
              ['Find a fresh perspective', 'Help me see a challenge differently.'],
            ].map(([title, text], i) => (
              <button
                key={title}
                onClick={() => setPrompt(text)}
                aria-pressed={prompt === text}
                className={`group flex items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left transition hover:border-forest/30 hover:bg-white ${prompt === text ? 'border-forest/30 bg-white' : 'border-line bg-white/40'}`}
              >
                <div>
                  <span className="text-[9px] text-muted">0{i + 1}</span>
                  <p className="mt-1 text-[11px] font-medium">{title}</p>
                </div>
                {prompt === text ? (
                  <Check size={13} className="shrink-0 text-forest" />
                ) : (
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                )}
              </button>
            ))}
          </div>
        </section>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-[10px] text-muted">
        <span>Less typing. More human.</span>
        <span>
          Built with React, Whisper & OpenAI<span className="mx-3 text-line">/</span>Made for a
          conversation.
        </span>
      </footer>

      <Settings
        open={settings}
        onClose={() => setSettings(false)}
        voice={agent.voice}
        setVoice={agent.setVoice}
        output={agent.output}
        setOutput={agent.setOutput}
        remember={agent.remember}
        setRemember={agent.setRemember}
        storageError={agent.storageError}
      />
      <dialog
        ref={helpDialog}
        onCancel={() => setHelp(false)}
        aria-labelledby="help-title"
        className="fixed m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-paper p-7 text-ink shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="help-title" className="font-display text-2xl">
            A conversation, in three steps.
          </h2>
          <button onClick={() => setHelp(false)} aria-label="Close help" className="rounded p-2">
            <X size={17} />
          </button>
        </div>
        <ol className="my-7 space-y-5">
          {[
            [
              'Make yourself heard',
              'Tap the microphone, allow access, and speak naturally. Headphones help prevent echo.',
            ],
            [
              'Take a breath',
              'Tap Finish speaking. Voxa transcribes your words and thinks about a reply.',
            ],
            [
              'Hear a new perspective',
              'Your answer appears in the conversation and plays aloud. Interrupt, replay, or keep talking.',
            ],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime text-xs">
                {i + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs leading-6 text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-xs leading-6 text-muted">
          Voxa sends live recordings and recent conversation context to OpenAI. Recordings are not
          saved by the app. Transcripts stay in memory unless you enable browser storage in
          settings. Reset clears the conversation.
        </p>
        <button
          onClick={() => setHelp(false)}
          className="mt-6 w-full rounded-xl bg-forest py-3 text-sm text-white"
        >
          Let’s talk
        </button>
      </dialog>
    </div>
  );
}
