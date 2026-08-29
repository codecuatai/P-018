import { Loader2, Mic, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from '../hooks/use-speech-recognition';
import { useAudioRecorder } from '../hooks/use-audio-recorder';
import { transcribeVoice } from '../lib/api-client';
import { VoiceTranscriptPreview } from './voice-transcript-preview';

export interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscript, onError, disabled }: VoiceInputProps) {
  const speech = useSpeechRecognition();
  const recorder = useAudioRecorder();
  const [isProcessing, setIsProcessing] = useState(false);
  const submittedRef = useRef(false);

  const [tier2Duration, setTier2Duration] = useState(0);
  const tier2TimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (recorder.isRecording) {
      setTier2Duration(0);
      tier2TimerRef.current = window.setInterval(() => {
        setTier2Duration(prev => prev + 1);
      }, 1000);
    } else {
      if (tier2TimerRef.current) {
        clearInterval(tier2TimerRef.current);
      }
    }
    return () => {
      if (tier2TimerRef.current) clearInterval(tier2TimerRef.current);
    };
  }, [recorder.isRecording]);

  useEffect(() => {
    if (speech.transcript && !speech.isListening && !submittedRef.current) {
      onTranscript(speech.transcript);
      speech.resetTranscript();
    } else if (!speech.isListening && speech.transcript) {
      speech.resetTranscript();
    }
  }, [speech.isListening, speech.transcript, speech.resetTranscript, onTranscript]);

  useEffect(() => {
    if (speech.error) {
      onError(speech.error);
    }
  }, [speech.error, onError]);

  useEffect(() => {
    async function processAudio(): Promise<void> {
      if (!recorder.audioBlob) return;

      setIsProcessing(true);
      try {
        const result = await transcribeVoice(recorder.audioBlob);
        if (!submittedRef.current) onTranscript(result.text);
      } catch {
        if (!submittedRef.current) onError('Không thể nhận dạng giọng nói. Vui lòng gõ tin nhắn.');
      } finally {
        setIsProcessing(false);
        recorder.clearAudio();
      }
    }

    if (recorder.audioBlob && !isProcessing) void processAudio();
  }, [recorder.audioBlob, recorder.clearAudio, onTranscript, onError, isProcessing]);

  const toggleRecording = useCallback(() => {
    if (disabled || isProcessing) return;

    submittedRef.current = false;

    if (speech.isSupported) {
      if (speech.isListening) {
        speech.stopListening();
      } else {
        speech.startListening();
      }
      return;
    }

    if (recorder.isRecording) {
      recorder.stopRecording();
    } else {
      void recorder.startRecording().catch(() => {
        onError('Không thể truy cập microphone. Vui lòng kiểm tra quyền.');
      });
    }
  }, [disabled, isProcessing, speech.isSupported, speech.isListening, speech.stopListening, speech.startListening, recorder.isRecording, recorder.stopRecording, recorder.startRecording, onError]);

  const cancelRecording = useCallback(() => {
    submittedRef.current = true;
    if (speech.isListening) {
      speech.stopListening();
      speech.resetTranscript();
    }
    if (recorder.isRecording) {
      recorder.cancelRecording();
    }
  }, [speech.isListening, speech.stopListening, speech.resetTranscript, recorder.isRecording, recorder.cancelRecording]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (speech.isListening || recorder.isRecording)) {
        cancelRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [speech.isListening, recorder.isRecording, cancelRecording]);

  const isRecording = speech.isListening || recorder.isRecording;

  let icon = <Mic size={18} aria-hidden="true" />;
  let btnClass = "composer-mic-btn";
  let ariaLabel = "Nhập bằng giọng nói";

  if (isProcessing) {
    icon = <Loader2 size={18} className="spinner" aria-hidden="true" />;
    btnClass += " voice-processing";
    ariaLabel = "Đang xử lý giọng nói";
  } else if (isRecording) {
    icon = <Square size={18} fill="currentColor" aria-hidden="true" />;
    btnClass += " voice-listening";
    ariaLabel = "Dừng ghi âm";
  }

  return (
    <>
      <button
        type="button"
        className={btnClass}
        onClick={toggleRecording}
        disabled={disabled || isProcessing}
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-pressed={isRecording}
      >
        {icon}
      </button>

      {isRecording && (
        <VoiceTranscriptPreview
          interimText={speech.isListening ? speech.interimTranscript : "Đang ghi âm..."}
          finalText={speech.isListening ? speech.transcript : ""}
          duration={speech.isListening ? speech.duration : tier2Duration}
          onCancel={cancelRecording}
        />
      )}
    </>
  );
}
