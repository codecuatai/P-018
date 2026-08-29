import { useCallback, useEffect, useRef, useState } from 'react';

// Extend window object to include webkitSpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function useSpeechRecognition() {
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const recognitionRef = useRef<any>(null);
  const durationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (final) {
        setTranscript((prev) => (prev ? prev + ' ' + final : final).trim());
      }
      setInterimTranscript(interim);
      setError(null);
    };

    recognition.onerror = (event: any) => {
      let errorMessage = 'Đã xảy ra lỗi nhận dạng giọng nói.';
      switch (event.error) {
        case 'not-allowed':
          errorMessage = 'Vui lòng cấp quyền microphone trong cài đặt trình duyệt.';
          break;
        case 'no-speech':
          errorMessage = 'Không nghe thấy giọng nói. Hãy thử lại.';
          break;
        case 'audio-capture':
          errorMessage = 'Không tìm thấy microphone.';
          break;
        case 'network':
          errorMessage = 'Lỗi kết nối mạng. Hãy thử lại.';
          break;
        case 'aborted':
          if (durationTimerRef.current !== null) {
            clearInterval(durationTimerRef.current);
            durationTimerRef.current = null;
          }
          return; // silent ignore user cancel
        case 'service-not-allowed':
          errorMessage = 'Dịch vụ nhận dạng giọng nói không khả dụng.';
          break;
      }
      setError(errorMessage);
      setIsListening(false);
      if (durationTimerRef.current !== null) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (durationTimerRef.current !== null) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // ignore InvalidStateError on abort
        }
      }
      if (durationTimerRef.current !== null) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, []);

  const startDurationTimer = useCallback(() => {
    setDuration(0);
    durationTimerRef.current = window.setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      setTranscript('');
      setInterimTranscript('');
      setError(null);
      recognitionRef.current.start();
      setIsListening(true);
      startDurationTimer();
    } catch {
      setError('Không thể bắt đầu nhận dạng giọng nói.');
    }
  }, [startDurationTimer]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {
      // ignore InvalidStateError
    }
    setIsListening(false);
    stopDurationTimer();
  }, [stopDurationTimer]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isListening) {
        stopListening();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isListening, stopListening]);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    duration,
    startListening,
    stopListening,
    resetTranscript,
  };
}
