import { act, renderHook, waitFor } from '@testing-library/react';

import { streamVoice, synthesizeVoice } from '../lib/api-client';
import { useSpeechSynthesis } from './use-speech-synthesis';

jest.mock('../lib/api-client', () => ({
  streamVoice: jest.fn(),
  synthesizeVoice: jest.fn(),
}));

const mockedStreamVoice = jest.mocked(streamVoice);
const mockedSynthesizeVoice = jest.mocked(synthesizeVoice);

class FakeAudio {
  static instances: FakeAudio[] = [];
  paused = true;
  playbackRate = 1;
  preload = '';
  src = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly play = jest.fn(async () => { this.paused = false; });
  readonly pause = jest.fn(() => { this.paused = true; });
  readonly removeAttribute = jest.fn((attribute: string) => {
    if (attribute === 'src') this.src = '';
  });
  readonly load = jest.fn();

  constructor(src?: string) {
    this.src = src ?? '';
    FakeAudio.instances.push(this);
  }
}

class FakeSourceBuffer extends EventTarget {
  readonly appendedByteLengths: number[] = [];

  appendBuffer(buffer: ArrayBuffer): void {
    this.appendedByteLengths.push(buffer.byteLength);
    queueMicrotask(() => this.dispatchEvent(new Event('updateend')));
  }
}

class FakeMediaSource extends EventTarget {
  static isTypeSupported = jest.fn(() => true);
  readyState: MediaSource['readyState'] = 'closed';
  readonly sourceBuffer = new FakeSourceBuffer();
  readonly endOfStream = jest.fn(() => { this.readyState = 'ended'; });

  constructor() {
    super();
    queueMicrotask(() => {
      this.readyState = 'open';
      this.dispatchEvent(new Event('sourceopen'));
    });
  }

  addSourceBuffer(): SourceBuffer {
    return this.sourceBuffer as unknown as SourceBuffer;
  }
}

describe('useSpeechSynthesis', () => {
  const originalAudio = globalThis.Audio;
  const originalMediaSource = globalThis.MediaSource;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    FakeAudio.instances = [];
    mockedStreamVoice.mockReset();
    mockedSynthesizeVoice.mockReset();
    mockedSynthesizeVoice.mockResolvedValue(new ArrayBuffer(4));
    Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:test-audio') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'Audio', { configurable: true, value: originalAudio });
    if (originalMediaSource) {
      Object.defineProperty(globalThis, 'MediaSource', { configurable: true, value: originalMediaSource });
    } else {
      delete (globalThis as { MediaSource?: typeof MediaSource }).MediaSource;
    }
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
  });

  it('keeps the fallback audio controls usable through pause, resume, and stop', async () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => result.current.speak('Xin chào'));
    expect(result.current.isPlaying).toBe(true);
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    expect(mockedStreamVoice).not.toHaveBeenCalled();

    act(() => result.current.pause());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isPaused).toBe(true);

    act(() => result.current.resume());
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isPaused).toBe(false);

    act(() => result.current.stop());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-audio');
  });

  it('appends streamed audio chunks through MediaSource without buffering the response', async () => {
    Object.defineProperty(globalThis, 'MediaSource', { configurable: true, value: FakeMediaSource });
    mockedStreamVoice.mockImplementation(async (_text, onChunk) => {
      await onChunk(new Uint8Array([1, 2]), true);
      await onChunk(new Uint8Array([3]), false);
    });

    const { result, unmount } = renderHook(() => useSpeechSynthesis());
    act(() => result.current.speak('Xin chào'));

    await waitFor(() => expect(mockedStreamVoice).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    expect(mockedSynthesizeVoice).not.toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(true);
    unmount();
  });
});
