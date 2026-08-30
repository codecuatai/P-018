import { Mic, Square, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState, useRef } from 'react';
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

  // Tier 2 Duration tracking
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

  // Handle Tier 1 (Web Speech API) final transcript
  useEffect(() => {
    if (speech.transcript && !speech.isListening) {
      if (!submittedRef.current) {
        onTranscript(speech.transcript);
      }
      speech.resetTranscript();
    }
  }, [speech.isListening, speech.transcript, onTranscript, speech]);

  // Handle Tier 1 Error
  useEffect(() => {
    if (speech.error) {
      onError(speech.error);
    }
  }, [speech.error, onError]);

  // Handle Tier 2 (MediaRecorder -> API) transcript
  useEffect(() => {
    async function processAudio() {
      if (!recorder.audioBlob) return;
      
      setIsProcessing(true);
      try {
        const result = await transcribeVoice(recorder.audioBlob);
        if (!submittedRef.current) {
          onTranscript(result.text);
        }
      } catch (err: any) {
        console.error('Tier 2 STT error:', err);
        if (!submittedRef.current) {
          onError('Không thể nhận dạng giọng nói. Vui lòng gõ tin nhắn.');
        }
      } finally {
        setIsProcessing(false);
        recorder.clearAudio();
      }
    }
    
    if (recorder.audioBlob && !isProcessing) {
      processAudio();
    }
  }, [recorder.audioBlob, recorder, onTranscript, onError, isProcessing]);

  const toggleRecording = useCallback(() => {
    if (disabled || isProcessing) return;

    submittedRef.current = false;

    if (speech.isSupported) {
      if (speech.isListening) {
        speech.stopListening();
      } else {
        speech.startListening();
      }
    } else {
      // Tier 2 Fallback
      if (recorder.isRecording) {
        recorder.stopRecording();
      } else {
        recorder.startRecording().catch(() => {
          onError('Không thể truy cập microphone. Vui lòng kiểm tra quyền.');
        });
      }
    }
  }, [disabled, isProcessing, speech, recorder, onError]);

  const cancelRecording = useCallback(() => {
    submittedRef.current = true;
    if (speech.isListening) {
      speech.stopListening();
      speech.resetTranscript();
    }
    if (recorder.isRecording) {
      recorder.cancelRecording();
    }
  }, [speech, recorder]);

  // Keyboard accessibility
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
  
  let icon = <Mic size={18} />;
  let btnClass = 'composer-mic-btn';
  let ariaLabel = 'Nhập bằng giọng nói';

  if (isProcessing) {
    icon = <Loader2 size={18} className="animate-spin" />;
    btnClass += ' voice-processing';
    ariaLabel = 'Đang xử lý giọng nói';
  } else if (isRecording) {
    icon = <Square size={18} fill="currentColor" />;
    btnClass += ' voice-listening';
    ariaLabel = 'Dừng ghi âm';
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

