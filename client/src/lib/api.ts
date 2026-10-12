import type { ContextMessage, Health, Voice } from '../../../shared/contracts';

export class RequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
async function request(path: string, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(50_000);
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new RequestError(
      timeout.aborted
        ? 'The request timed out. Please try again.'
        : 'Cannot reach the server. Check your connection and try again.',
      'NETWORK_ERROR',
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new RequestError(
      body?.error?.message || 'Something went wrong. Please try again.',
      body?.error?.code || 'REQUEST_FAILED',
      body?.error?.requestId,
    );
  }
  return response;
}
const json = (body: unknown, signal: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal,
});
export const api = {
  async health(signal?: AbortSignal): Promise<Health> {
    return (await request('health', { signal })).json();
  },
  async transcribe(blob: Blob, signal: AbortSignal): Promise<string> {
    const form = new FormData();
    const extension = blob.type.includes('mp4')
      ? 'mp4'
      : blob.type.includes('ogg')
        ? 'ogg'
        : 'webm';
    form.append('audio', blob, `recording.${extension}`);
    return (await (await request('transcribe', { method: 'POST', body: form, signal })).json())
      .text;
  },
  async respond(text: string, history: ContextMessage[], signal: AbortSignal): Promise<string> {
    return (await (await request('respond', json({ text, history }, signal))).json()).text;
  },
  async speak(text: string, voice: Voice, signal: AbortSignal): Promise<Blob> {
    return (await request('speak', json({ text, voice }, signal))).blob();
  },
};
