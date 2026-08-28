import { useCallback, useEffect, useRef, useState } from 'react';

import { stripMarkdownForTts } from '../lib/strip-markdown-for-tts';

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
  const [isSupported, setIsSupported] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [rate, setRate] = useState(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSupported(false);
      return;
    }
    
    const synth = window.speechSynthesis;
    const updateVoices = () => setVoices(synth.getVoices());
    
    updateVoices();
    synth.addEventListener('voiceschanged', updateVoices);
    
    return () => synth.removeEventListener('voiceschanged', updateVoices);
  }, []);
  
  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  }, []);
  
  const pause = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  }, []);
  
  const resume = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
    }
  }, []);
  
  const speak = useCallback((text: string) => {
    if (!isSupported) return;
    
    stop();
    
    const synth = window.speechSynthesis;
    const cleanText = stripMarkdownForTts(text);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Attempt to find a Vietnamese voice, fallback to any available
    const vnVoice = voices.find(v => v.lang.startsWith('vi')) || voices[0];
    if (vnVoice) {
      utterance.voice = vnVoice;
    }
    
    utterance.lang = 'vi-VN';
    utterance.rate = rate;
    
    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };
    
    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.error('SpeechSynthesis error:', e);
      }
      setIsPlaying(false);
      setIsPaused(false);
    };
    
    utteranceRef.current = utterance;
    synth.speak(utterance);
  }, [isSupported, voices, rate, stop]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    isSupported,
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
