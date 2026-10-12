import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function ready(page: Page) {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', configured: true } }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start talking', exact: true })).toBeEnabled();
}
async function record(page: Page) {
  await page.getByRole('button', { name: /Start talking|Keep talking/ }).click();
  await expect(page.getByRole('heading', { name: 'Listening to you' })).toBeVisible();
  await page.waitForTimeout(1100); // Actual recorded audio must pass the minimum-duration gate.
  await page.getByRole('button', { name: 'Finish speaking' }).click();
}
test('shows honest setup state and responsive preview, sample, settings, reset', async ({
  page,
}) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', configured: false } }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start talking', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'docs/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Preview a sample conversation' }).click();
  await expect(page.getByText('Sample conversation · not a live response')).toBeVisible();
  await page.screenshot({ path: 'docs/conversation.png', fullPage: true });
  await page.getByRole('button', { name: 'Open voice settings' }).click();
  await page.getByLabel('Remember this conversation').check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  await expect(page.getByText('Good conversations start')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'docs/mobile.png', fullPage: true });
});
test('records with MediaRecorder, sends audio, preserves context, and plays the reply', async ({
  page,
}) => {
  let uploadSize = 0;
  const inputs: { text: string; history: unknown[] }[] = [];
  await page.route('**/api/transcribe', (route) => {
    uploadSize = route.request().postDataBuffer()?.length ?? 0;
    return route.fulfill({ json: { text: 'Help me plan a walk.' } });
  });
  await page.route('**/api/respond', (route) => {
    inputs.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: 'Try a quiet park nearby.' } });
  });
  await page.route('**/api/speak', (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      body: readFileSync('test-results/fixtures/voice.wav'),
    }),
  );
  await ready(page);
  await record(page);
  await expect(page.getByText('Try a quiet park nearby.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Voxa is speaking' })).toBeVisible();
  expect(uploadSize).toBeGreaterThan(1000);
  expect(inputs[0].history).toEqual([]);
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await record(page);
  await expect.poll(() => inputs.length).toBe(2);
  expect(inputs[1].history).toEqual([
    { role: 'user', content: 'Help me plan a walk.' },
    { role: 'assistant', content: 'Try a quiet park nearby.' },
  ]);
});
test('retries only the failed response without duplicating the user message', async ({ page }) => {
  let transcriptionCalls = 0,
    answerCalls = 0;
  await page.route('**/api/transcribe', (route) => {
    transcriptionCalls++;
    return route.fulfill({ json: { text: 'A test thought.' } });
  });
  await page.route('**/api/respond', (route) => {
    answerCalls++;
    return answerCalls === 1
      ? route.fulfill({ status: 502, json: { error: { message: 'Temporary provider failure.' } } })
      : route.fulfill({ json: { text: 'A useful answer.' } });
  });
  await page.route('**/api/speak', (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      body: readFileSync('test-results/fixtures/voice.wav'),
    }),
  );
  await ready(page);
  await record(page);
  await expect(page.getByRole('alert')).toContainText('Temporary provider failure.');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('A useful answer.', { exact: true })).toBeVisible();
  expect(transcriptionCalls).toBe(1);
  expect(answerCalls).toBe(2);
  await expect(page.getByText('A test thought.', { exact: true })).toHaveCount(1);
});
test('reset discards a late response and does not create an assistant message', async ({
  page,
}) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/transcribe', (route) =>
    route.fulfill({ json: { text: 'A slow thought.' } }),
  );
  await page.route('**/api/respond', async (route) => {
    await wait;
    await route.fulfill({ json: { text: 'This answer must be discarded.' } }).catch(() => {});
  });
  await ready(page);
  await record(page);
  await expect(page.getByRole('heading', { name: 'A moment to think' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  release();
  await expect(page.getByText('Good conversations start')).toBeVisible();
  await expect(page.getByText('This answer must be discarded.')).toHaveCount(0);
});
test('handles denied microphone permission without making API calls', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await ready(page);
  await page.getByRole('button', { name: 'Start talking', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was denied');
  await expect(page.getByRole('button', { name: 'Start talking', exact: true })).toBeEnabled();
});
test('late microphone permission after cancel releases all tracks', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      (window as unknown as { captured: MediaStream }).captured = stream;
      await new Promise((resolve) => setTimeout(resolve, 900));
      return stream;
    };
  });
  await ready(page);
  await page.getByRole('button', { name: 'Start talking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Allow microphone access' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel current activity' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { captured?: MediaStream }).captured
          ?.getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await expect(page.getByRole('heading', { name: 'Ready when you are' })).toBeVisible();
});

test('near-silence stays local and displays actionable feedback', async ({ page }) => {
  let uploads = 0;
  await page.route('**/api/transcribe', (route) => {
    uploads++;
    return route.fulfill({ json: { text: 'Should not happen.' } });
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  await ready(page);
  await record(page);
  await expect(page.getByRole('alert')).toContainText('I didn’t hear any speech');
  expect(uploads).toBe(0);
});

test('blocked autoplay retains the answer and reuses cached audio for replay', async ({ page }) => {
  let speechCalls = 0;
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let first = true;
    HTMLMediaElement.prototype.play = function () {
      if (first) {
        first = false;
        return Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.route('**/api/transcribe', (route) =>
    route.fulfill({ json: { text: 'A little question.' } }),
  );
  await page.route('**/api/respond', (route) =>
    route.fulfill({ json: { text: 'An answer worth hearing.' } }),
  );
  await page.route('**/api/speak', (route) => {
    speechCalls++;
    return route.fulfill({
      contentType: 'audio/wav',
      body: readFileSync('test-results/fixtures/voice.wav'),
    });
  });
  await ready(page);
  await record(page);
  await expect(page.getByRole('alert')).toContainText('Audio could not play');
  await expect(page.getByText('An answer worth hearing.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Replay response', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Voxa is speaking' })).toBeVisible();
  expect(speechCalls).toBe(1);
});

test('opt-in history survives reload and reset clears persistent messages', async ({ page }) => {
  await page.route('**/api/transcribe', (route) =>
    route.fulfill({ json: { text: 'Remember my thought.' } }),
  );
  await page.route('**/api/respond', (route) =>
    route.fulfill({ json: { text: 'Let’s explore it.' } }),
  );
  await page.route('**/api/speak', (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      body: readFileSync('test-results/fixtures/voice.wav'),
    }),
  );
  await ready(page);
  await page.getByRole('button', { name: 'Open voice settings' }).click();
  await page.getByLabel('Remember this conversation').check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await record(page);
  await expect(page.getByText('Let’s explore it.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Remember my thought.', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download transcript' }).click();
  expect((await download).suggestedFilename()).toMatch(/^voxa-.*\.txt$/);
  await page.getByRole('button', { name: 'Reset conversation', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Good conversations start')).toBeVisible();
  await expect(page.getByText('Remember my thought.', { exact: true })).toHaveCount(0);
});

test('automatic recording deadline finishes the recording and releases the microphone', async ({
  page,
}) => {
  // Scale the 60-second limit only; actual MediaRecorder and microphone cleanup still run.
  await page.addInitScript(() => {
    const timeout = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      timeout(handler, delay === 60_000 ? 1800 : delay, ...args)) as typeof window.setTimeout;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      (window as unknown as { captured: MediaStream }).captured = stream;
      return stream;
    };
  });
  await page.route('**/api/transcribe', (route) =>
    route.fulfill({ json: { text: 'A bounded recording.' } }),
  );
  await page.route('**/api/respond', (route) =>
    route.fulfill({ json: { text: 'A timely reply.' } }),
  );
  await page.route('**/api/speak', (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      body: readFileSync('test-results/fixtures/voice.wav'),
    }),
  );
  await ready(page);
  await page.getByRole('button', { name: 'Start talking', exact: true }).click();
  await expect(page.getByText('A timely reply.', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { captured: MediaStream }).captured
        .getTracks()
        .every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
});
