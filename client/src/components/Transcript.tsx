import { useEffect, useRef } from 'react';
import { ArrowDownToLine, AudioLines, MessageCircle, Play, Square, RotateCcw } from 'lucide-react';
import type { ChatMessage } from '../../../shared/contracts';
import type { Phase } from '../hooks/useVoiceAgent';
import { exportHistory } from '../lib/history';

interface Props {
  messages: ChatMessage[];
  phase: Phase;
  activeMessage: string | null;
  onReplay(message: ChatMessage): void;
  onStop(): void;
  onReset(): void;
  onSample(): void;
}
export function Transcript({
  messages,
  phase,
  activeMessage,
  onReplay,
  onStop,
  onReset,
  onSample,
}: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    if (following.current && scroll.current)
      scroll.current.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);
  const busy = !['idle', 'speaking'].includes(phase);
  const isSample = messages.some((m) => m.sample);
  return (
    <section
      aria-labelledby="conversation-title"
      className="flex min-h-[480px] flex-col overflow-hidden rounded-[26px] border border-line bg-white lg:h-[615px]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-paper">
            <MessageCircle size={17} />
          </span>
          <div>
            <h2 id="conversation-title" className="text-sm font-semibold">
              Your conversation
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {isSample
                ? 'Sample conversation · not a live response'
                : messages.length
                  ? `${messages.length} messages · a thought at a time`
                  : 'A fresh start, every time'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => exportHistory(messages)}
            disabled={!messages.length}
            aria-label="Download transcript"
            title="Download transcript"
            className="rounded-lg p-2 text-muted hover:bg-paper disabled:opacity-30"
          >
            <ArrowDownToLine size={16} />
          </button>
          <button
            onClick={onReset}
            disabled={!messages.length && phase === 'idle'}
            aria-label="Reset conversation"
            title="Reset conversation"
            className="rounded-lg p-2 text-muted hover:bg-paper disabled:opacity-30"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div
        ref={scroll}
        onScroll={() => {
          const el = scroll.current;
          if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="max-h-[520px] flex-1 overflow-y-auto px-5 py-6 sm:px-7"
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!messages.length ? (
          <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
            <div className="relative mb-6 flex size-16 items-center justify-center rounded-2xl border border-line bg-paper">
              <AudioLines size={29} strokeWidth={1.25} className="text-forest" />
              <span className="absolute -right-1 -top-1 size-4 rounded-full border-[3px] border-white bg-lime" />
            </div>
            <h3 className="font-display text-[25px] tracking-tight">
              Good conversations start
              <br />
              with a simple hello.
            </h3>
            <p className="mt-3 max-w-64 text-[13px] leading-6 text-muted">
              Tap the microphone and say what’s on your mind. Your words will appear here.
            </p>
            <button
              onClick={onSample}
              className="mt-6 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-forest hover:bg-paper"
            >
              <Play size={12} /> Preview a sample conversation
            </button>
          </div>
        ) : (
          <div className="space-y-7">
            {messages.map((message) => (
              <article key={message.id} className={message.role === 'user' ? 'ml-7' : 'mr-3'}>
                <div
                  className={`mb-2 flex items-center gap-2 text-[10px] font-medium tracking-wide ${message.role === 'user' ? 'justify-end' : ''}`}
                >
                  <span className={message.role === 'assistant' ? 'text-forest' : 'text-muted'}>
                    {message.role === 'assistant' ? 'VOXA' : 'YOU'}
                  </span>
                  <time className="font-normal text-muted" dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <div
                  className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3.5 text-[13px] leading-[1.8] ${message.role === 'user' ? 'rounded-tr-sm bg-paper' : 'rounded-tl-sm bg-[#edf3e9]'}`}
                >
                  {message.content}
                </div>
                {message.role === 'assistant' && (
                  <button
                    onClick={() => (activeMessage === message.id ? onStop() : onReplay(message))}
                    disabled={busy}
                    aria-label={activeMessage === message.id ? 'Stop playback' : 'Replay response'}
                    className="mt-2 flex items-center gap-1.5 rounded px-1 py-1 text-[11px] text-muted hover:text-forest disabled:opacity-40"
                  >
                    {activeMessage === message.id ? <Square size={11} /> : <Play size={11} />}{' '}
                    {activeMessage === message.id ? 'Stop playback' : 'Replay'}
                    {message.sample && <span className="ml-1 text-muted">· browser voice</span>}
                  </button>
                )}
              </article>
            ))}
            {['transcribing', 'thinking', 'synthesizing'].includes(phase) && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="size-1.5 animate-pulse rounded-full bg-forest" />
                {phase === 'transcribing'
                  ? 'Turning your voice into words…'
                  : phase === 'thinking'
                    ? 'Voxa is thinking…'
                    : 'Preparing your voice response…'}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-line bg-paper/40 px-4 py-4 text-[10px] text-muted">
        <span className="size-1 rounded-full bg-muted/60" />A space for your ideas. AI can make
        mistakes.
      </div>
    </section>
  );
}
