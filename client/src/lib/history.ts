import { z } from 'zod';
import { messageSchema, type ChatMessage } from '../../../shared/contracts';

const KEY = 'voxa.history.v1';
const storedSchema = z
  .array(
    messageSchema.extend({
      id: z.string(),
      createdAt: z.string().datetime(),
      sample: z.boolean().optional(),
    }),
  )
  .max(100);
export function loadHistory(): { remember: boolean; messages: ChatMessage[] } {
  try {
    const stored = localStorage.getItem(KEY);
    return stored
      ? { remember: true, messages: storedSchema.parse(JSON.parse(stored)) }
      : { remember: false, messages: [] };
  } catch {
    return { remember: false, messages: [] };
  }
}
export function saveHistory(messages: ChatMessage[], remember: boolean): boolean {
  try {
    if (remember)
      localStorage.setItem(KEY, JSON.stringify(messages.filter((m) => !m.sample).slice(-100)));
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
export function exportHistory(messages: ChatMessage[]) {
  const text = messages
    .map(
      (m) =>
        `${m.role === 'user' ? 'You' : 'Voxa'}${m.sample ? ' (sample)' : ''} · ${new Date(m.createdAt).toLocaleString()}\n${m.content}`,
    )
    .join('\n\n');
  const url = URL.createObjectURL(
    new Blob([`Voxa conversation\n\n${text}\n`], { type: 'text/plain;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `voxa-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
