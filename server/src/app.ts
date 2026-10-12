import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ZodError } from 'zod';
import OpenAI from 'openai';
import { MAX_AUDIO_BYTES, respondSchema, speakSchema } from '../../shared/contracts.js';
import { AppError } from './errors.js';
import type { VoiceProvider } from './provider.js';

interface Options {
  provider?: VoiceProvider;
  production?: boolean;
  origin?: string;
  rateLimitMax?: number;
  timeoutMs?: number;
}
const supportedAudio = new Set(['audio/webm', 'audio/mp4', 'audio/wav', 'audio/mpeg', 'audio/ogg']);

export function createApp(options: Options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: options.production
        ? { directives: { 'media-src': ["'self'", 'blob:'], 'upgrade-insecure-requests': null } }
        : false,
      strictTransportSecurity: options.production ? undefined : false,
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.set({ 'X-Request-Id': res.locals.requestId, 'Cache-Control': 'no-store' });
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', configured: Boolean(options.provider) }),
  );
  // Same-origin production and an explicit development allowlist. No permissive CORS.
  app.use('/api', (req, _res, next) => {
    const origin = req.get('origin');
    const allowed = options.production
      ? [options.origin]
      : [options.origin, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    if (origin && !allowed.includes(origin))
      return next(new AppError(403, 'ORIGIN_REJECTED', 'This origin is not allowed.'));
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: options.rateLimitMax ?? 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please wait a minute.',
            requestId: res.locals.requestId,
          },
        }),
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, cb) => {
      if (!supportedAudio.has(file.mimetype.split(';')[0]))
        return cb(new AppError(415, 'UNSUPPORTED_AUDIO', 'Use WebM, MP4, WAV, MP3, or OGG audio.'));
      cb(null, true);
    },
  });
  const requireProvider: RequestHandler = (_req, _res, next) => {
    next(
      options.provider
        ? undefined
        : new AppError(
            503,
            'NOT_CONFIGURED',
            'Add OPENAI_API_KEY to the server .env file, then restart the server.',
          ),
    );
  };
  // Disconnect and deadline both cancel upstream work. Race also bounds a stalled provider.
  async function run<T>(
    req: express.Request,
    res: express.Response,
    task: (signal: AbortSignal) => Promise<T>,
  ) {
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', cancel);
    res.once('close', cancel);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task(controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AppError(504, 'TIMEOUT', 'The request took too long. Please try again.'));
          }, options.timeoutMs ?? 45_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      req.off('aborted', cancel);
      res.off('close', cancel);
    }
  }
  app.post('/api/transcribe', requireProvider, upload.single('audio'), async (req, res) => {
    if (!req.file?.buffer.length)
      throw new AppError(400, 'MISSING_AUDIO', 'Record some audio first.');
    const text = await run(req, res, (signal) =>
      options.provider!.transcribe(req.file!.buffer, req.file!.mimetype.split(';')[0], signal),
    );
    if (!text.trim())
      throw new AppError(
        422,
        'NO_SPEECH',
        'No speech was detected. Please move closer to the microphone and try again.',
      );
    if (text.length > 4000)
      throw new AppError(
        422,
        'TRANSCRIPT_TOO_LONG',
        'Please keep your recording shorter and try again.',
      );
    res.json({ text });
  });
  app.post('/api/respond', requireProvider, async (req, res) => {
    const { text, history } = respondSchema.parse(req.body);
    const answer = await run(req, res, (signal) =>
      options.provider!.respond(text, history, signal),
    );
    res.json({ text: answer });
  });
  app.post('/api/speak', requireProvider, async (req, res) => {
    const { text, voice } = speakSchema.parse(req.body);
    const audio = await run(req, res, (signal) => options.provider!.speak(text, voice, signal));
    res.type('audio/mpeg').send(audio);
  });
  app.use('/api', (_req, _res, next) =>
    next(new AppError(404, 'NOT_FOUND', 'This API endpoint does not exist.')),
  );
  if (options.production) {
    app.use(express.static(resolve('dist/client')));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = 'Something went wrong. Please try again.';
    if (error instanceof AppError) ({ status, code, message } = error);
    else if (error instanceof ZodError) {
      status = 400;
      code = 'INVALID_INPUT';
      message = 'Please provide valid text and conversation history.';
    } else if (error instanceof multer.MulterError) {
      status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      code = 'INVALID_UPLOAD';
      message = 'Send one audio file of up to 10 MB in the audio field.';
    } else if (error instanceof SyntaxError && 'body' in error) {
      status = 400;
      code = 'INVALID_JSON';
      message = 'The request must contain valid JSON.';
    } else if (error?.type === 'entity.too.large') {
      status = 413;
      code = 'BODY_TOO_LARGE';
      message = 'The request is too large.';
    } else if (error instanceof OpenAI.APIError) {
      status = error.status === 429 ? 429 : 502;
      code = 'PROVIDER_ERROR';
      message =
        status === 429
          ? 'The AI service is busy or its usage limit has been reached. Please try later.'
          : 'The AI service is unavailable. Check the server API key and model access.';
    }
    // Never log audio, transcripts, keys, or raw provider errors.
    if (process.env.NODE_ENV !== 'test')
      console.error(JSON.stringify({ requestId: res.locals.requestId, status, code }));
    if (!res.headersSent && !res.destroyed)
      res.status(status).json({ error: { code, message, requestId: res.locals.requestId } });
  };
  app.use(errorHandler);
  return app;
}
