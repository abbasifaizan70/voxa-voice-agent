import { useEffect, useRef } from 'react';
import { AudioLines, LockKeyhole, X } from 'lucide-react';
import type { Voice } from '../../../shared/contracts';

interface Props {
  open: boolean;
  onClose(): void;
  voice: Voice;
  setVoice(value: Voice): void;
  output: 'openai' | 'browser';
  setOutput(value: 'openai' | 'browser'): void;
  remember: boolean;
  setRemember(value: boolean): void;
  storageError: boolean;
  providerLabel: string;
  browserOnly: boolean;
}
export function Settings(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (props.open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [props.open]);
  return (
    <dialog
      ref={dialog}
      onCancel={props.onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
      aria-labelledby="settings-title"
      className="fixed m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-paper p-7 text-ink shadow-2xl"
    >
      <div className="mb-7 flex items-center justify-between">
        <h2 id="settings-title" className="text-xl font-semibold">
          Make yourself comfortable
        </h2>
        <button
          onClick={props.onClose}
          aria-label="Close settings"
          className="rounded-full p-2 hover:bg-line"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mb-6 flex gap-3">
        <AudioLines className="mt-1 shrink-0 text-forest" size={20} />
        <div className="grow">
          <label htmlFor="output" className="mb-1 block text-sm font-semibold">
            Voice output
          </label>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            {props.browserOnly
              ? 'Groq mode uses your browser’s speech service. No OpenAI voice credits are needed.'
              : 'OpenAI provides the default voice. Browser voice uses your device’s speech service.'}
          </p>
          <select
            id="output"
            value={props.output}
            disabled={props.browserOnly}
            onChange={(e) => props.setOutput(e.target.value as Props['output'])}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
          >
            {!props.browserOnly && <option value="openai">OpenAI voice</option>}
            <option value="browser">Browser voice</option>
          </select>
        </div>
      </div>
      {props.output === 'openai' && (
        <div className="mb-7 pl-8">
          <label htmlFor="voice" className="mb-2 block text-sm font-semibold">
            Choose a voice
          </label>
          <select
            id="voice"
            value={props.voice}
            onChange={(e) => props.setVoice(e.target.value as Voice)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
          >
            <option value="coral">Coral</option>
            <option value="alloy">Alloy</option>
            <option value="sage">Sage</option>
          </select>
        </div>
      )}
      <div className="border-t border-line pt-6">
        <label className="flex cursor-pointer items-start gap-3">
          <LockKeyhole size={20} className="mt-1 shrink-0" />
          <span className="grow">
            <span className="block text-sm font-semibold">Remember this conversation</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              Save transcripts in this browser. Off by default. Reset clears the saved conversation.
            </span>
          </span>
          <input
            type="checkbox"
            checked={props.remember}
            onChange={(e) => props.setRemember(e.target.checked)}
            className="mt-1 size-4 accent-forest"
          />
        </label>
      </div>
      {props.storageError && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          Browser storage is unavailable. Your conversation is only kept in memory.
        </p>
      )}
      <p className="mt-6 rounded-xl bg-white p-3 text-xs leading-relaxed text-muted">
        Live audio and conversation context are sent to {props.providerLabel}. This app does not
        save recordings. Browser voice may use your device or browser vendor’s speech service. The
        voice you hear is AI-generated.
      </p>
      <button
        onClick={props.onClose}
        className="mt-5 w-full rounded-xl bg-forest py-3 text-sm font-medium text-white hover:bg-forest/90"
      >
        Done
      </button>
    </dialog>
  );
}
