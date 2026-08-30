import { useCallback, useEffect, useRef, useState } from 'react';

import { stripMarkdownForTts } from '../lib/strip-markdown-for-tts';
import { streamVoice, synthesizeVoice } from '../lib/api-client';

const AUDIO_MIME_TYPE = 'audio/mpeg';

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function supportsStreamingAudio(): boolean {
  if (typeof window === 'undefined' || typeof MediaSource === 'undefined') return false;
  try {
    return MediaSource.isTypeSupported(AUDIO_MIME_TYPE);
  } catch {
    return false;
  }
}

function waitForSourceBuffer(mediaSource: MediaSource, signal: AbortSignal): Promise<SourceBuffer> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      mediaSource.removeEventListener('sourceopen', handleSourceOpen);
      signal.removeEventListener('abort', handleAbort);
    };

    const resolveOnce = (sourceBuffer: SourceBuffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(sourceBuffer);
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleAbort = () => rejectOnce(createAbortError());
    const handleSourceOpen = () => {
      try {
        if (mediaSource.readyState !== 'open') {
          throw new Error('MediaSource closed before opening a source buffer.');
        }
        resolveOnce(mediaSource.addSourceBuffer(AUDIO_MIME_TYPE));
      } catch (error) {
        rejectOnce(error);
      }
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    mediaSource.addEventListener('sourceopen', handleSourceOpen, { once: true });
    if (signal.aborted) {
      handleAbort();
    } else if (mediaSource.readyState === 'open') {
      handleSourceOpen();
    }
  });
}

function appendAudioChunk(sourceBuffer: SourceBuffer, chunk: Uint8Array, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      sourceBuffer.removeEventListener('updateend', handleUpdateEnd);
      sourceBuffer.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleUpdateEnd = () => resolveOnce();
    const handleError = () => rejectOnce(new Error('MediaSource audio append failed.'));
    const handleAbort = () => rejectOnce(createAbortError());

    if (signal.aborted) {
      handleAbort();
      return;
    }

    signal.addEventListener('abort', handleAbort, { once: true });
    sourceBuffer.addEventListener('updateend', handleUpdateEnd, { once: true });
    sourceBuffer.addEventListener('error', handleError, { once: true });
    try {
      // DOM's SourceBuffer accepts an ArrayBuffer-backed BufferSource. Copying
      // also prevents a provider-owned Uint8Array view from being reused while
      // the browser is still parsing the append.
      const buffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(buffer).set(chunk);
      sourceBuffer.appendBuffer(buffer);
    } catch (error) {
      rejectOnce(error);
    }
  });
}

export interface TtsControl {
  isSupported: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  rate: number;
  setRate: (rate: number) => void;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useSpeechSynthesis(): TtsControl {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (mediaSourceRef.current?.readyState === 'open') {
      try {
        mediaSourceRef.current.endOfStream();
      } catch {
        // The source may still be updating or already be detached.
      }
    }
    mediaSourceRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    pausedRef.current = false;
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setIsPlaying(false);
    setIsPaused(false);
  }, [cleanup]);

  const pause = useCallback(() => {
    if (!abortRef.current) return;
    pausedRef.current = true;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    setIsPaused(true);
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (!abortRef.current) return;
    pausedRef.current = false;
    setIsPaused(false);
    setIsPlaying(true);
    if (audioRef.current?.paused && objectUrlRef.current) {
      audioRef.current.play().catch(() => {
        // The stream may not have appended its first playable bytes yet.
      });
    }
  }, []);

  const speak = useCallback((text: string) => {
    // Stop any current playback first
    stop();

    const cleanText = stripMarkdownForTts(text);
    if (!cleanText) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setIsPlaying(true);
    setIsPaused(false);

    let hasAudioData = false;
    const isCurrent = () => abortRef.current === controller && !controller.signal.aborted;
    const finish = () => {
      if (abortRef.current !== controller) return;
      cleanup();
      setIsPlaying(false);
      setIsPaused(false);
    };
    const playAudio = () => {
      const audio = audioRef.current;
      if (!audio || pausedRef.current || !isCurrent()) return;
      audio.play().then(() => {
        if (isCurrent() && !pausedRef.current) {
          setIsPlaying(true);
          setIsPaused(false);
        }
      }).catch((error: unknown) => {
        if (!isCurrent()) return;
        // A MediaSource can reject play before its first append. Retry after
        // the first chunk; a later failure is a real playback failure.
        if (!hasAudioData) return;
        if ((error as { name?: unknown })?.name !== 'AbortError') {
          console.error('Audio play failed:', error);
        }
        finish();
      });
    };
    const attachAudio = (audio: HTMLAudioElement, url: string) => {
      objectUrlRef.current = url;
      audio.preload = 'auto';
      audio.playbackRate = rate;
      audioRef.current = audio;
      audio.onended = finish;
      audio.onerror = () => {
        if (!isCurrent()) return;
        console.error('Audio playback error');
        finish();
      };
    };

    const playStreamingAudio = async () => {
      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      mediaSourceRef.current = mediaSource;
      const audio = new Audio();
      audio.src = url;
      attachAudio(audio, url);
      const sourceBufferPromise = waitForSourceBuffer(mediaSource, controller.signal);

      // Start from the user gesture before the first network chunk when the
      // browser permits it; the first append below retries once data exists.
      playAudio();
      await streamVoice(cleanText, async (chunk, isFirstChunk) => {
        const sourceBuffer = await sourceBufferPromise;
        if (!isCurrent()) throw createAbortError();
        await appendAudioChunk(sourceBuffer, chunk, controller.signal);
        if (isFirstChunk) {
          hasAudioData = true;
          playAudio();
        }
      }, controller.signal);

      if (isCurrent() && mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream();
        } catch {
          // Playback can finish naturally if the source closes concurrently.
        }
      }
    };

    const playBufferedAudio = async () => {
      const audioData = await synthesizeVoice(cleanText, controller.signal);
      if (!isCurrent()) return;

      const blob = new Blob([audioData], { type: AUDIO_MIME_TYPE });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      hasAudioData = true;
      attachAudio(audio, url);
      playAudio();
    };

    (supportsStreamingAudio() ? playStreamingAudio() : playBufferedAudio()).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error('TTS API error:', error);
      finish();
    });
  }, [rate, stop, cleanup]);

  // Update playback rate on existing audio when rate changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, [rate]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isSupported: typeof window !== 'undefined',
    isPlaying,
    isPaused,
    rate,
    setRate,
    speak,
    pause,
    resume,
    stop,
  };
}
