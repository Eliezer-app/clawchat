import { createSignal, Show } from 'solid-js';
import { formatSize, formatDuration } from '../format';

interface InputAreaProps {
  onSend: (content: string, file: File | null) => Promise<void>;
}

export default function InputArea(props: InputAreaProps) {
  const [input, setInput] = createSignal('');
  const [file, setFile] = createSignal<File | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [recording, setRecording] = createSignal(false);
  const [recordingDuration, setRecordingDuration] = createSignal(0);

  let fileInput: HTMLInputElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let mediaRecorder: MediaRecorder | null = null;
  let recordingInterval: number | null = null;

  const send = async () => {
    const content = input().trim();
    const currentFile = file();

    if (!content && !currentFile) return;

    setInput('');
    setFile(null);
    setUploading(true);
    if (textareaRef) textareaRef.style.height = 'auto';

    try {
      await props.onSend(content, currentFile);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const voiceFile = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        setFile(voiceFile);
        if (recordingInterval) clearInterval(recordingInterval);
        setRecordingDuration(0);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingDuration(0);
      recordingInterval = setInterval(() => setRecordingDuration(d => d + 1), 1000) as unknown as number;
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  return (
    <div class="input-area">
      <Show when={file()}>
        {(f) => (
          <div class="file-preview">
            <Show
              when={f().type.startsWith('image/')}
              fallback={
                <Show when={f().type.startsWith('audio/')} fallback={<span class="file-icon">📎</span>}>
                  <span class="file-icon">🎤</span>
                </Show>
              }
            >
              <img src={URL.createObjectURL(f())} alt="Preview" />
            </Show>
            <div class="file-preview-info">
              <div class="file-preview-name">{f().name}</div>
              <div class="file-preview-size">{formatSize(f().size)}</div>
            </div>
            <button class="file-preview-remove" onClick={() => setFile(null)}>×</button>
          </div>
        )}
      </Show>
      <Show when={recording()}>
        <div class="recording-indicator">
          <span class="recording-dot" />
          <span>Recording {formatDuration(recordingDuration())}</span>
          <button class="stop-btn" onClick={stopRecording}>Stop</button>
        </div>
      </Show>
      <div class="input-row">
        <button class="attach-btn" onClick={() => fileInput?.click()}>📎</button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt,audio/*"
          onChange={(e) => setFile(e.currentTarget.files?.[0] || null)}
        />
        <button
          class="mic-btn"
          classList={{ recording: recording() }}
          onClick={() => recording() ? stopRecording() : startRecording()}
        >
          🎤
        </button>
        <div class="input-pill">
          <textarea
            ref={textareaRef}
            value={input()}
            onInput={(e) => {
              setInput(e.currentTarget.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !uploading()) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message..."
            rows="1"
          />
          <button class="send-btn" onClick={() => send()} disabled={uploading()}>
            {uploading() ? '…' : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
}
