import { useCallback, useEffect, useRef, useState } from 'react';

import { stripMarkdownForTts } from '../lib/strip-markdown-for-tts';
import { synthesizeVoice } from '../lib/api-client';

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
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setIsPlaying(false);
    setIsPaused(false);
  }, [cleanup]);

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused && objectUrlRef.current) {
      audioRef.current.play().catch(() => {
        // Silently handle play failure
      });
      setIsPaused(false);
      setIsPlaying(true);
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

    synthesizeVoice(cleanText, controller.signal)
      .then((audioData) => {
        // Check if we were cancelled while waiting
        if (controller.signal.aborted) return;

        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audio.playbackRate = rate;
        audioRef.current = audio;

        audio.onended = () => {
          setIsPlaying(false);
          setIsPaused(false);
          cleanup();
        };

        audio.onerror = () => {
          setIsPlaying(false);
          setIsPaused(false);
          cleanup();
        };

        audio.play().catch(() => {
          setIsPlaying(false);
          setIsPaused(false);
          cleanup();
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setIsPlaying(false);
        setIsPaused(false);
        cleanup();
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
