import { Play, Square, Pause, Settings2 } from 'lucide-react';
import { useState } from 'react';
import type { TtsControl } from '../hooks/use-speech-synthesis';

export interface VoiceOutputProps {
  text: string;
  tts: TtsControl;
  messageId: string;
  activeMessageId: string | null;
  onPlay: (id: string | null) => void;
}

export function VoiceOutput({ text, tts, messageId, activeMessageId, onPlay }: VoiceOutputProps) {
  const [showSettings, setShowSettings] = useState(false);

  if (!tts.isSupported) {
    return null; // Don't render anything if TTS is not supported
  }

  const isActive = activeMessageId === messageId;
  const isPlaying = isActive && tts.isPlaying;
  const isPaused = isActive && tts.isPaused;

  const handlePlayPause = () => {
    if (isPlaying) {
      tts.pause();
    } else if (isPaused) {
      tts.resume();
    } else {
      onPlay(messageId);
      tts.speak(text);
    }
  };

  const handleStop = () => {
    tts.stop();
    onPlay(null);
    setShowSettings(false);
  };

  return (
    <div className="voice-output">
      <button
        type="button"
        className={`voice-output-btn ${isPlaying || isPaused ? 'active' : ''}`}
        onClick={handlePlayPause}
        aria-label={isPlaying ? 'Tạm dừng đọc' : isPaused ? 'Tiếp tục đọc' : 'Đọc văn bản'}
        title={isPlaying ? 'Tạm dừng' : isPaused ? 'Tiếp tục' : 'Đọc'}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>

      {(isPlaying || isPaused) && (
        <>
          <button
            type="button"
            className="voice-output-btn"
            onClick={handleStop}
            aria-label="Dừng đọc"
            title="Dừng"
          >
            <Square size={12} fill="currentColor" />
          </button>

          <button
            type="button"
            className={`voice-output-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Cài đặt tốc độ đọc"
            title="Tốc độ đọc"
          >
            <Settings2 size={14} />
          </button>

          {showSettings && (
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={tts.rate}
              onChange={(e) => tts.setRate(parseFloat(e.target.value))}
              className="voice-speed-slider"
              aria-label="Điều chỉnh tốc độ"
              title={`${tts.rate}x`}
            />
          )}
        </>
      )}
    </div>
  );
}
