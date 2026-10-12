import { createApp } from './app.js';
import { createProvider } from './provider.js';

const production = process.env.NODE_ENV === 'production';
if (production && !process.env.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production.');
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid TCP port.');
const host = process.env.HOST || '127.0.0.1';
const configuration = createProvider(process.env);
const server = createApp({ ...configuration, production, origin: process.env.APP_ORIGIN }).listen(
  port,
  host,
  () => {
    console.log(`Voxa API listening on http://${host}:${port}`);
    console.log(`AI provider: ${configuration.providerName}`);
    if (!configuration.provider)
      console.log(
        `Set ${configuration.providerName === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'} in .env to enable voice conversations.`,
      );
  },
);
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
