import { z } from 'zod';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_MS = 60_000;
export const MAX_HISTORY = 20;
export const messageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(4000),
  })
  .strict();
export const respondSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    history: z.array(messageSchema).max(MAX_HISTORY).default([]),
  })
  .strict();
export const speakSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    voice: z.enum(['coral', 'alloy', 'sage']).default('coral'),
  })
  .strict();
export type ContextMessage = z.infer<typeof messageSchema>;
export type Voice = z.infer<typeof speakSchema>['voice'];
export interface ChatMessage extends ContextMessage {
  id: string;
  createdAt: string;
  sample?: boolean;
}
export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}
export interface Health {
  status: 'ok';
  configured: boolean;
  provider: 'openai' | 'groq';
  speechOutput: 'openai' | 'browser';
}
