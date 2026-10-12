import OpenAI, { toFile } from 'openai';
import type { ContextMessage, Health, Voice } from '../../shared/contracts.js';
import { AppError } from './errors.js';

// The transport depends on this interface, so tests never need credentials or paid calls.
export interface VoiceProvider {
  transcribe(audio: Buffer, mime: string, signal: AbortSignal): Promise<string>;
  respond(text: string, history: ContextMessage[], signal: AbortSignal): Promise<string>;
  speak(text: string, voice: Voice, signal: AbortSignal): Promise<Buffer>;
}

export function createProvider(env: NodeJS.ProcessEnv): {
  providerName: Health['provider'];
  provider?: VoiceProvider;
} {
  const providerName = env.AI_PROVIDER?.trim() || 'openai';
  if (providerName !== 'openai' && providerName !== 'groq')
    throw new Error('AI_PROVIDER must be openai or groq.');
  const groq = providerName === 'groq';
  const apiKey = (groq ? env.GROQ_API_KEY : env.OPENAI_API_KEY)?.trim();
  // Never fall back to a different provider or send its credentials to the wrong host.
  if (!apiKey) return { providerName };
  const client = new OpenAI({
    apiKey,
    baseURL: groq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1',
    timeout: 40_000,
    maxRetries: 0,
  });
  const chatModel = groq
    ? env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b'
    : env.CHAT_MODEL || 'gpt-4.1-mini';
  const transcriptionModel = groq
    ? env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo'
    : env.TRANSCRIPTION_MODEL || 'whisper-1';
  const provider: VoiceProvider = {
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
          model: transcriptionModel,
        },
        { signal },
      );
      return result.text.trim();
    },
    async respond(text, history, signal) {
      // Chat Completions keeps this bounded, text-only context simple and explicit.
      const result = await client.chat.completions.create(
        {
          model: chatModel,
          ...(groq ? {} : { store: false }),
          // GPT-OSS needs room for reasoning as well as the short spoken answer.
          max_completion_tokens: groq ? 2048 : 350,
          ...(groq && chatModel.startsWith('openai/gpt-oss-')
            ? { reasoning_effort: 'low' as const, include_reasoning: false }
            : {}),
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
      if (groq)
        throw new AppError(
          409,
          'BROWSER_SPEECH_ONLY',
          'Groq mode uses browser voice. Refresh the app to load the current voice settings.',
        );
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
  return { providerName, provider };
}
