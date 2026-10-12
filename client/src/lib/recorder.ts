import { MAX_AUDIO_BYTES } from '../../../shared/contracts';

export interface Recording {
  stop(): Promise<Blob>;
  cancel(): void;
}
export async function openMicrophone(onLevel: (level: number) => void): Promise<Recording> {
  if (
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === 'undefined'
  ) {
    throw new Error(
      'Recording requires a supported browser on HTTPS or localhost. Try current Chrome, Edge, or Safari.',
    );
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (error) {
    const name = (error as DOMException).name;
    throw new Error(
      name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser’s site settings and try again.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Connect one and try again.'
          : 'The microphone is unavailable. Close other apps using it and try again.',
    );
  }
  let context: AudioContext | undefined;
  let animation = 0,
    voicedFrames = 0;
  const started = performance.now();
  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  let canceled = false;
  const cleanup = () => {
    cancelAnimationFrame(animation);
    stream.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    onLevel(0);
  };
  try {
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType)
      throw new Error(
        'This browser cannot record a supported audio format. Try Chrome, Edge, or Safari.',
      );
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
    try {
      context = new AudioContext();
      // Some browsers can leave resume() pending behind an autoplay policy.
      // Recording and cleanup must never wait on the optional level analyser.
      void context.resume().catch(() => {});
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const sample = () => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length,
        );
        if (rms > 0.008) voicedFrames++;
        onLevel(Math.min(1, rms * 5));
        animation = requestAnimationFrame(sample);
      };
      sample();
    } catch {
      if (context) void context.close().catch(() => {});
      context = undefined;
    }
    recorder.start(250);
  } catch (error) {
    cleanup();
    throw error;
  }

  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error('Recording failed. Please try again.'));
    };
    recorder.onstop = () => {
      const analyzed = context?.state === 'running';
      cleanup();
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (canceled) return reject(new DOMException('Recording canceled', 'AbortError'));
      if (performance.now() - started < 500 || !blob.size || (analyzed && voicedFrames < 3))
        return reject(
          new Error('I didn’t hear any speech. Try speaking a little closer to your microphone.'),
        );
      if (blob.size > MAX_AUDIO_BYTES)
        return reject(new Error('This recording is too large. Please try a shorter message.'));
      resolve(blob);
    };
  });
  // Cancellation and unexpected device errors can occur before stop() is awaited.
  void completed.catch(() => {});
  return {
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
      return completed;
    },
    cancel() {
      canceled = true;
      if (recorder.state !== 'inactive') recorder.stop();
      cleanup();
    },
  };
}
