import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProvider } from './provider';

// Exercise the real SDK serialization and routing without credentials or network calls.
let requests: Request[];
let response: unknown;
beforeEach(() => {
  requests = [];
  response = { choices: [{ message: { content: ' A useful reply. ' } }] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // The SDK probes the Response constructor before serializing multipart uploads.
      if (input === 'data:,') return new Response('');
      requests.push(new Request(input, init));
      return Response.json(response);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;

describe('provider selection and transport', () => {
  it('uses only the Groq key, endpoint and models even when OpenAI is configured', async () => {
    const { providerName, provider } = createProvider({
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'groq-test-key',
      OPENAI_API_KEY: 'openai-test-key',
      CHAT_MODEL: 'gpt-4.1-mini',
      TRANSCRIPTION_MODEL: 'whisper-1',
    });
    expect(providerName).toBe('groq');
    const history = [{ role: 'user' as const, content: 'I enjoy hiking.' }];
    expect(await provider!.respond('Where should I walk?', history, signal())).toBe(
      'A useful reply.',
    );
    expect(requests[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(requests[0].headers.get('authorization')).toBe('Bearer groq-test-key');
    const body = await requests[0].json();
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-20b',
      include_reasoning: false,
      reasoning_effort: 'low',
    });
    expect(body).not.toHaveProperty('store');
    expect(body.messages.slice(1)).toEqual([
      ...history,
      { role: 'user', content: 'Where should I walk?' },
    ]);

    response = { text: ' Hello Voxa ' };
    expect(await provider!.transcribe(Buffer.from('recorded-audio'), 'audio/webm', signal())).toBe(
      'Hello Voxa',
    );
    expect(requests[1].url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(requests[1].headers.get('authorization')).toBe('Bearer groq-test-key');
    const upload = await requests[1].formData();
    expect(upload.get('model')).toBe('whisper-large-v3-turbo');
    const file = upload.get('file') as File;
    expect(file.name).toBe('recording.webm');
    expect(file.type).toBe('audio/webm');
    expect(await file.text()).toBe('recorded-audio');
  });

  it('never makes a paid speech request in Groq mode', async () => {
    const { provider } = createProvider({
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'groq-test-key',
      OPENAI_API_KEY: 'openai-test-key',
    });
    await expect(provider!.speak('Hello', 'coral', signal())).rejects.toMatchObject({
      code: 'BROWSER_SPEECH_ONLY',
      status: 409,
    });
    expect(requests).toHaveLength(0);
  });

  it('does not fall back when the selected key is missing', () => {
    expect(
      createProvider({ AI_PROVIDER: 'groq', OPENAI_API_KEY: 'test-key', GROQ_API_KEY: ' ' }),
    ).toEqual({ providerName: 'groq' });
    expect(createProvider({ AI_PROVIDER: 'openai', GROQ_API_KEY: 'test-key' })).toEqual({
      providerName: 'openai',
    });
    expect(requests).toHaveLength(0);
  });

  it('fails startup for an invalid provider name', () => {
    expect(() => createProvider({ AI_PROVIDER: 'grog' })).toThrow(
      'AI_PROVIDER must be openai or groq',
    );
  });

  it('keeps the original OpenAI defaults and speech endpoint', async () => {
    const { providerName, provider } = createProvider({
      OPENAI_API_KEY: 'openai-test-key',
      GROQ_API_KEY: 'groq-test-key',
    });
    expect(providerName).toBe('openai');
    await provider!.respond('Hello', [], signal());
    expect(requests[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(requests[0].headers.get('authorization')).toBe('Bearer openai-test-key');
    expect(await requests[0].json()).toMatchObject({
      model: 'gpt-4.1-mini',
      store: false,
      max_completion_tokens: 350,
    });
    response = { text: 'Hello' };
    await provider!.transcribe(Buffer.from('recorded-audio'), 'audio/mp4', signal());
    expect((await requests[1].formData()).get('model')).toBe('whisper-1');
    await provider!.speak('Hello', 'sage', signal());
    expect(requests[2].url).toBe('https://api.openai.com/v1/audio/speech');
    expect(await requests[2].json()).toMatchObject({
      model: 'gpt-4o-mini-tts',
      input: 'Hello',
      voice: 'sage',
      response_format: 'mp3',
    });
  });

  it('honors Groq-specific model overrides', async () => {
    const { provider } = createProvider({
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'groq-test-key',
      GROQ_CHAT_MODEL: 'openai/gpt-oss-120b',
      GROQ_TRANSCRIPTION_MODEL: 'whisper-large-v3',
    });
    await provider!.respond('Hello', [], signal());
    expect((await requests[0].json()).model).toBe('openai/gpt-oss-120b');
    response = { text: 'Hello' };
    await provider!.transcribe(Buffer.from('recorded-audio'), 'audio/wav', signal());
    expect((await requests[1].formData()).get('model')).toBe('whisper-large-v3');
  });

  it('rejects an empty final answer rather than speaking reasoning content', async () => {
    response = { choices: [{ message: { content: '', reasoning: 'Internal reasoning.' } }] };
    const { provider } = createProvider({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'groq-test-key' });
    await expect(provider!.respond('Hello', [], signal())).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
    });
  });
});
