import OpenAI, { toFile } from 'openai';
import type { ContextMessage, Voice } from '../../shared/contracts.js';
import { AppError } from './errors.js';

// The transport depends on this interface, so tests never need credentials or paid calls.
export interface VoiceProvider {
  transcribe(audio: Buffer, mime: string, signal: AbortSignal): Promise<string>;
  respond(text: string, history: ContextMessage[], signal: AbortSignal): Promise<string>;
  speak(text: string, voice: Voice, signal: AbortSignal): Promise<Buffer>;
}

export function createOpenAIProvider(env: NodeJS.ProcessEnv): VoiceProvider | undefined {
  if (!env.OPENAI_API_KEY?.trim()) return undefined;
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 40_000, maxRetries: 0 });
  return {
    async transcribe(audio, mime, signal) {
      const extension = (
        {
          'audio/webm': 'webm',
          'audio/mp4': 'mp4',
          'audio/wav': 'wav',
          'audio/mpeg': 'mp3',
          'audio/ogg': 'ogg',
        } as Record<string, string>
      )[mime];
      const result = await client.audio.transcriptions.create(
        {
          file: await toFile(audio, `recording.${extension}`, { type: mime }),
          model: env.TRANSCRIPTION_MODEL || 'whisper-1',
        },
        { signal },
      );
      return result.text.trim();
    },
    async respond(text, history, signal) {
      // Chat Completions keeps this bounded, text-only context simple and explicit.
      const result = await client.chat.completions.create(
        {
          model: env.CHAT_MODEL || 'gpt-4.1-mini',
          store: false,
          max_completion_tokens: 350,
          messages: [
            {
              role: 'system',
              content:
                'You are Voxa, a thoughtful voice assistant. Reply in the language the user speaks. Keep answers conversational, useful, and usually under 90 words. Use plain spoken language without markdown, lists, or special formatting. Be honest about uncertainty and your limitations. Do not claim to take actions or access live information. Ask one concise question when clarification is needed.',
            },
            ...history,
            { role: 'user', content: text },
          ],
        },
        { signal },
      );
      const answer = result.choices[0]?.message.content?.trim();
      if (!answer)
        throw new AppError(
          502,
          'EMPTY_RESPONSE',
          'The assistant did not return an answer. Please try again.',
        );
      return answer;
    },
    async speak(text, voice, signal) {
      const result = await client.audio.speech.create(
        {
          model: env.TTS_MODEL || 'gpt-4o-mini-tts',
          voice,
          input: text,
          response_format: 'mp3',
        },
        { signal },
      );
      return Buffer.from(await result.arrayBuffer());
    },
  };
}
