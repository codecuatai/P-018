import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceInput } from '../components/voice-input';

// Mock the hooks and API client
jest.mock('../hooks/use-speech-recognition', () => ({
  useSpeechRecognition: jest.fn(),
}));

jest.mock('../hooks/use-audio-recorder', () => ({
  useAudioRecorder: jest.fn(),
}));

jest.mock('../lib/api-client', () => ({
  transcribeVoice: jest.fn(),
}));

import { useSpeechRecognition } from '../hooks/use-speech-recognition';
import { useAudioRecorder } from '../hooks/use-audio-recorder';

describe('VoiceInput', () => {
  const mockOnTranscript = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Web Speech API (Tier 1) when supported', () => {
    const mockStartListening = jest.fn();
    (useSpeechRecognition as jest.Mock).mockReturnValue({
      isSupported: true,
      isListening: false,
      transcript: '',
      interimTranscript: '',
      error: null,
      duration: 0,
      startListening: mockStartListening,
      stopListening: jest.fn(),
      resetTranscript: jest.fn(),
    });

    (useAudioRecorder as jest.Mock).mockReturnValue({
      isRecording: false,
      audioBlob: null,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      clearAudio: jest.fn(),
    });

    render(<VoiceInput onTranscript={mockOnTranscript} onError={mockOnError} />);
    
    const btn = screen.getByRole('button', { name: 'Nhập bằng giọng nói' });
    fireEvent.click(btn);
    
    expect(mockStartListening).toHaveBeenCalled();
  });

  it('falls back to MediaRecorder (Tier 2) when Web Speech API is not supported', () => {
    const mockStartRecording = jest.fn().mockResolvedValue(undefined);
    (useSpeechRecognition as jest.Mock).mockReturnValue({
      isSupported: false,
      isListening: false,
      transcript: '',
      error: null,
      startListening: jest.fn(),
      resetTranscript: jest.fn(),
      stopListening: jest.fn(),
    });

    (useAudioRecorder as jest.Mock).mockReturnValue({
      isRecording: false,
      audioBlob: null,
      startRecording: mockStartRecording,
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      clearAudio: jest.fn(),
    });

    render(<VoiceInput onTranscript={mockOnTranscript} onError={mockOnError} />);
    
    const btn = screen.getByRole('button', { name: 'Nhập bằng giọng nói' });
    fireEvent.click(btn);
    
    expect(mockStartRecording).toHaveBeenCalled();
  });

  it('reports error when Tier 2 permission is denied', async () => {
    const mockStartRecording = jest.fn().mockRejectedValue(new Error('Not allowed'));
    (useSpeechRecognition as jest.Mock).mockReturnValue({
      isSupported: false,
      isListening: false,
      transcript: '',
      error: null,
      startListening: jest.fn(),
      resetTranscript: jest.fn(),
      stopListening: jest.fn(),
    });

    (useAudioRecorder as jest.Mock).mockReturnValue({
      isRecording: false,
      audioBlob: null,
      startRecording: mockStartRecording,
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      clearAudio: jest.fn(),
    });

    render(<VoiceInput onTranscript={mockOnTranscript} onError={mockOnError} />);
    
    const btn = screen.getByRole('button', { name: 'Nhập bằng giọng nói' });
    fireEvent.click(btn);
    
    // Wait for promise rejection to propagate
    await Promise.resolve();
    expect(mockOnError).toHaveBeenCalledWith('Không thể truy cập microphone. Vui lòng kiểm tra quyền.');
  });

  it('cancels recording on Escape key', () => {
    const mockCancelRecording = jest.fn();
    (useSpeechRecognition as jest.Mock).mockReturnValue({
      isSupported: false,
      isListening: false,
      transcript: '',
      error: null,
      startListening: jest.fn(),
      resetTranscript: jest.fn(),
      stopListening: jest.fn(),
    });

    (useAudioRecorder as jest.Mock).mockReturnValue({
      isRecording: true,
      audioBlob: null,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: mockCancelRecording,
      clearAudio: jest.fn(),
    });

    render(<VoiceInput onTranscript={mockOnTranscript} onError={mockOnError} />);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    
    expect(mockCancelRecording).toHaveBeenCalled();
  });

  it('cancels Tier 1 recording on Escape key', () => {
    const mockStopListening = jest.fn();
    const mockResetTranscript = jest.fn();
    
    (useSpeechRecognition as jest.Mock).mockReturnValue({
      isSupported: true,
      isListening: true,
      transcript: 'Hello',
      interimTranscript: 'Hello world',
      error: null,
      duration: 5,
      startListening: jest.fn(),
      resetTranscript: mockResetTranscript,
      stopListening: mockStopListening,
    });

    (useAudioRecorder as jest.Mock).mockReturnValue({
      isRecording: false,
      audioBlob: null,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      clearAudio: jest.fn(),
    });

    render(<VoiceInput onTranscript={mockOnTranscript} onError={mockOnError} />);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    
    expect(mockStopListening).toHaveBeenCalled();
    expect(mockResetTranscript).toHaveBeenCalled();
  });
});
