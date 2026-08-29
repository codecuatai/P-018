export interface VoiceTranscriptPreviewProps {
  interimText: string;
  finalText: string;
  duration: number;
  onCancel: () => void;
}

export function VoiceTranscriptPreview({
  interimText,
  finalText,
  duration,
  onCancel,
}: VoiceTranscriptPreviewProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayText = interimText || finalText || 'Đang nghe...';

  return (
    <div className="voice-transcript-preview" aria-live="polite">
      <span className="voice-indicator" aria-hidden="true">🎤</span>
      <span className="voice-transcript-text" title={displayText}>
        {displayText}
      </span>
      <span className="voice-duration" aria-label={`Thời gian ghi âm: ${formatDuration(duration)}`}>
        {formatDuration(duration)}
      </span>
      <button
        type="button"
        className="voice-cancel-btn"
        onClick={onCancel}
        aria-label="Hủy ghi âm"
        title="Hủy ghi âm"
      >
        ✕
      </button>
    </div>
  );
}
