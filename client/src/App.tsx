import { createSignal, onMount, For, createEffect, Show, onCleanup } from 'solid-js';
import type { Message } from '@clawchat/shared';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/github-dark.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);

function CodeBlock(props: { lang: string; code: string }) {
  const [copied, setCopied] = createSignal(false);

  const highlighted = () => {
    if (props.lang && hljs.getLanguage(props.lang)) {
      return hljs.highlight(props.code, { language: props.lang }).value;
    }
    return hljs.highlightAuto(props.code).value;
  };

  const copy = async () => {
    await navigator.clipboard.writeText(props.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="code-block">
      <div class="code-header">
        <span class="code-lang">{props.lang || 'code'}</span>
        <button class="code-copy" onClick={copy}>
          {copied() ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre><code innerHTML={highlighted()} /></pre>
    </div>
  );
}

function Widget(props: { code: string; conversationId?: string }) {
  const [visible, setVisible] = createSignal(false);
  const [widgetId, setWidgetId] = createSignal<string | null>(null);
  let containerRef: HTMLDivElement | undefined;
  let iframeRef: HTMLIFrameElement | undefined;
  let saveTimeout: number | undefined;

  const convId = () => props.conversationId || 'default';

  const handleMessage = async (e: MessageEvent) => {
    // Only handle messages from our iframe
    if (!iframeRef || e.source !== iframeRef.contentWindow) return;
    const { type, id, state, version } = e.data || {};

    if (type === 'ready' && id) {
      setWidgetId(id);
      // Fetch saved state from server
      try {
        const res = await fetch(`/api/widget-state/${convId()}/${id}`);
        const saved = res.ok ? await res.json() : null;
        iframeRef?.contentWindow?.postMessage({
          type: 'init',
          state: saved?.state || null,
          stateVersion: saved?.version || null,
        }, '*');
      } catch {
        iframeRef?.contentWindow?.postMessage({ type: 'init', state: null }, '*');
      }
    }

    if (type === 'state' && widgetId()) {
      // Debounce saves - wait 500ms of inactivity
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        fetch(`/api/widget-state/${convId()}/${widgetId()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, version: version || 1 }),
        }).catch(() => {});
      }, 500) as unknown as number;
    }

    if (type === 'resize' && e.data.height && iframeRef) {
      iframeRef.style.height = Math.min(Math.max(e.data.height, 60), 600) + 'px';
    }

    // Proxy requests to server
    if (type === 'request' && e.data.action) {
      const { id, action, payload } = e.data;
      fetch(`/api/widget-action/${convId()}/${widgetId()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      })
        .then(res => res.json())
        .then(data => {
          iframeRef?.contentWindow?.postMessage({ type: 'response', id, data }, '*');
        })
        .catch(err => {
          iframeRef?.contentWindow?.postMessage({ type: 'response', id, error: err.message }, '*');
        });
    }
  };

  onMount(() => {
    if (!containerRef) return;
    window.addEventListener('message', handleMessage);

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(containerRef);

    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener('message', handleMessage);
      if (saveTimeout) clearTimeout(saveTimeout);
    });
  });

  return (
    <div class="widget-container" ref={containerRef}>
      <Show when={visible()} fallback={<div class="widget-placeholder">Widget paused</div>}>
        <iframe
          ref={iframeRef}
          srcdoc={props.code}
          sandbox="allow-scripts"
          class="widget-iframe"
        />
      </Show>
    </div>
  );
}

function AudioPlayer(props: { src: string; filename?: string }) {
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  let audio: HTMLAudioElement | undefined;

  const onMeta = () => setDuration(audio!.duration);
  const onTime = () => setCurrentTime(audio!.currentTime);
  const onEnd = () => { setPlaying(false); setCurrentTime(0); };

  onMount(() => {
    audio = new Audio(props.src);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
  });

  onCleanup(() => {
    if (audio) {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.pause();
      audio.src = '';
    }
  });

  const toggle = () => {
    if (!audio) return;
    if (playing()) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing());
  };

  const seek = (e: MouseEvent) => {
    if (!audio || !duration()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration();
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const download = async () => {
    const res = await fetch(props.src);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = props.filename || 'audio.webm';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div class="audio-player">
      <button class="audio-play" onClick={toggle}>
        {playing() ? '⏸' : '▶'}
      </button>
      <div class="audio-progress" onClick={seek}>
        <div class="audio-progress-bar" style={{ width: `${duration() ? (currentTime() / duration()) * 100 : 0}%` }} />
      </div>
      <span class="audio-time">{fmt(currentTime())}/{fmt(duration())}</span>
      <button class="audio-download" onClick={download}>↓</button>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [input, setInput] = createSignal('');
  const [file, setFile] = createSignal<File | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [recording, setRecording] = createSignal(false);
  const [recordingDuration, setRecordingDuration] = createSignal(0);
  const [lightbox, setLightbox] = createSignal<{ src: string; filename: string } | null>(null);

  const openLightbox = (src: string, filename: string) => {
    setLightbox({ src, filename });
    history.pushState({ lightbox: true }, '');
  };

  const closeLightbox = () => {
    if (lightbox()) {
      setLightbox(null);
    }
  };

  let messagesContainer: HTMLDivElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let mediaRecorder: MediaRecorder | null = null;
  let recordingInterval: number | null = null;

  // Auto-scroll to bottom when new messages arrive
  createEffect(() => {
    messages();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  onMount(async () => {
    // Handle Android back button
    window.addEventListener('popstate', () => closeLightbox());

    try {
      const res = await fetch('/api/messages');
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    }

    function connectSSE() {
      const events = new EventSource('/api/events');
      events.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'message') {
          setMessages(msgs => [...msgs, data.message]);
        }
      };
      events.onerror = () => {
        events.close();
        setTimeout(connectSSE, 3000);
      };
    }
    connectSSE();
  });

  const send = async () => {
    const content = input().trim();
    const currentFile = file();

    if (!content && !currentFile) return;

    setInput('');
    setFile(null);
    setUploading(true);
    if (textareaRef) textareaRef.style.height = 'auto';

    try {
      if (currentFile) {
        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('content', content);
        await fetch('/api/upload', { method: 'POST', body: formData });
      } else {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (mimetype: string) => mimetype.startsWith('image/');
  const isAudio = (mimetype: string) => mimetype.startsWith('audio/');

  const linkify = (text: string) => {
    // Match URLs but exclude trailing punctuation
    const urlRegex = /(https?:\/\/[^\s<>\"')\]]+[^\s<>\"')\].,;:!?])/g;
    const parts = text.split(urlRegex);
    return parts.map((part) =>
      urlRegex.test(part)
        ? <a href={part} target="_blank" rel="noopener noreferrer" class="message-link">{part}</a>
        : part
    );
  };

  const renderContent = (text: string, conversationId: string) => {
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    const parts: (string | { lang: string; code: string })[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push({ lang: match[1] || '', code: match[2].trim() });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.map((part) =>
      typeof part === 'string'
        ? linkify(part)
        : part.lang === 'widget'
          ? <Widget code={part.code} conversationId={conversationId} />
          : <CodeBlock lang={part.lang} code={part.code} />
    );
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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getFileUrl = (msg: Message) => {
    if (!msg.attachment) return '';
    const ext = msg.attachment.filename.split('.').pop() || '';
    return `/api/files/${msg.attachment.id}.${ext}`;
  };

  const downloadFile = async (url: string, filename: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html, body, #root {
          height: 100%;
          overflow: hidden;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: #f5f5f5;
          color: #1a1a1a;
          -webkit-font-smoothing: antialiased;
        }

        .app {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: 768px;
          margin: 0 auto;
          background: #fff;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }

        .header {
          padding: 16px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-weight: 600;
          font-size: 18px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header::before {
          content: '';
          width: 10px;
          height: 10px;
          background: #4ade80;
          border-radius: 50%;
          box-shadow: 0 0 6px #4ade80;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #fafafa;
          scrollbar-color: #ccc #fafafa;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 95%;
          min-width: 0;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
          align-self: flex-end;
          align-items: flex-end;
        }

        .message.agent {
          align-self: flex-start;
          align-items: flex-start;
        }

        .bubble {
          padding: 12px 16px;
          border-radius: 18px;
          font-size: 15px;
          line-height: 1.4;
          word-wrap: break-word;
          overflow: hidden;
          min-width: 0;
          white-space: pre-wrap;
        }

        .message.user .bubble {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message.agent .bubble {
          background: #fff;
          color: #1a1a1a;
          border: 1px solid #e5e5e5;
          border-bottom-left-radius: 4px;
        }

        .bubble img {
          max-width: 100%;
          border-radius: 12px;
          margin-top: 8px;
          display: block;
        }

        .message-link {
          color: inherit;
          text-decoration: underline;
          word-break: break-all;
        }

        .message-link:hover {
          opacity: 0.8;
        }

        .code-block {
          margin-top: 8px;
          border-radius: 8px;
          background: #1e1e1e;
          overflow: hidden;
          min-width: 200px;
        }

        .code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 12px;
          background: #333;
        }

        .code-lang {
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .code-copy {
          padding: 4px 10px;
          background: #555;
          border: none;
          border-radius: 4px;
          color: #ddd;
          font-size: 11px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .code-copy:hover {
          background: #666;
        }

        .code-block pre {
          margin: 0;
          padding: 12px;
          font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-all;
          overflow-x: auto;
          color: #d4d4d4;
        }

        .code-block code {
          font-family: inherit;
          background: transparent !important;
          color: inherit;
        }

        .widget-container {
          margin-top: 8px;
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
          border: 1px solid #e0e0e0;
        }

        .widget-iframe {
          width: 100%;
          height: 100px;
          border: none;
          display: block;
        }

        .widget-placeholder {
          padding: 24px;
          text-align: center;
          color: #888;
          font-size: 13px;
        }

        .bubble .file-attachment {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(0,0,0,0.1);
          border-radius: 8px;
          margin-top: 8px;
          text-decoration: none;
          color: inherit;
        }

        .message.user .bubble .file-attachment {
          background: rgba(255,255,255,0.2);
        }

        .file-icon {
          font-size: 24px;
        }

        .file-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .file-name {
          font-weight: 500;
          font-size: 14px;
        }

        .file-size {
          font-size: 12px;
          opacity: 0.7;
        }

        .time {
          font-size: 11px;
          color: #999;
          margin-top: 4px;
          padding: 0 4px;
        }

        .input-area {
          padding: 12px 16px;
          background: #fff;
          border-top: 1px solid #eee;
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex-shrink: 0;
        }

        .file-preview {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: #f0f0f0;
          border-radius: 8px;
        }

        .file-preview img {
          width: 40px;
          height: 40px;
          object-fit: cover;
          border-radius: 4px;
        }

        .file-preview-info {
          flex: 1;
          overflow: hidden;
        }

        .file-preview-name {
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-preview-size {
          font-size: 12px;
          color: #666;
        }

        .file-preview-remove {
          padding: 4px 8px;
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          font-size: 18px;
        }

        .input-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .input-pill {
          flex: 1;
          display: flex;
          align-items: stretch;
          border-radius: 24px;
          overflow: hidden;
          min-width: 0;
          border: 1px solid #e0e0e0;
        }

        .input-pill textarea {
          flex: 1;
          min-width: 0;
          padding: 12px 16px;
          border: none;
          background: #fff;
          font-size: 16px;
          outline: none;
          resize: none;
          font-family: inherit;
          line-height: 1.4;
          max-height: 120px;
          overflow-y: auto;
          scrollbar-color: #ccc #fff;
        }

        .input-pill textarea::placeholder {
          color: #999;
        }

        .input-area input[type="file"] {
          display: none;
        }

        .attach-btn,
        .mic-btn {
          width: 44px;
          height: 44px;
          padding: 0;
          background: #f0f0f0;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          font-size: 20px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .attach-btn:hover,
        .mic-btn:hover {
          background: #e0e0e0;
        }

        .mic-btn.recording {
          background: #ef4444;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .recording-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: #fef2f2;
          border-radius: 8px;
          color: #dc2626;
          font-size: 14px;
        }

        .recording-dot {
          width: 10px;
          height: 10px;
          background: #ef4444;
          border-radius: 50%;
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .stop-btn {
          margin-left: auto;
          padding: 6px 12px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .stop-btn:hover {
          background: #b91c1c;
        }

        .audio-player {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 75vw;
          max-width: 300px;
          padding: 4px 0;
        }

        .audio-play {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.2);
          color: inherit;
          font-size: 14px;
          cursor: pointer;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .message.agent .audio-play {
          background: rgba(0,0,0,0.1);
        }

        .audio-progress {
          flex: 1;
          height: 6px;
          background: rgba(255,255,255,0.3);
          border-radius: 3px;
          cursor: pointer;
          overflow: hidden;
        }

        .message.agent .audio-progress {
          background: rgba(0,0,0,0.15);
        }

        .audio-progress-bar {
          height: 100%;
          background: currentColor;
          opacity: 0.8;
          border-radius: 3px;
          transition: width 0.1s;
        }

        .audio-time {
          font-size: 11px;
          opacity: 0.8;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }

        .audio-download {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.2);
          color: inherit;
          font-size: 14px;
          cursor: pointer;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .message.agent .audio-download {
          background: rgba(0,0,0,0.1);
        }

        .send-btn {
          padding: 12px 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          font-size: 18px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .send-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .send-btn:not(:disabled):active {
          transform: scale(0.96);
        }

        .send-btn:not(:disabled):hover {
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          font-size: 15px;
        }

        @media (max-width: 768px) {
          .app {
            max-width: 100%;
            box-shadow: none;
          }
        }

        .lightbox {
          position: fixed;
          inset: 0;
          background: #000;
          z-index: 1000;
          animation: fadeIn 0.2s ease-out;
        }

        .lightbox img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .lightbox-buttons {
          position: absolute;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 12px;
        }

        .lightbox-buttons button {
          padding: 12px 24px;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
          border: none;
          border-radius: 24px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }

        .lightbox-buttons button:active {
          opacity: 0.8;
        }

        @media (prefers-color-scheme: dark) {
          body {
            background: #1a1a1a;
            color: #fff;
          }
          .app {
            background: #242424;
          }
          .messages {
            background: #1a1a1a;
            scrollbar-color: #444 #1a1a1a;
          }
          .message.agent .bubble {
            background: #333;
            color: #fff;
            border-color: #444;
          }
          .input-area {
            background: #242424;
            border-top-color: #333;
          }
          .input-pill {
            border-color: #444;
          }
          .input-pill textarea {
            background: #333;
            color: #fff;
            scrollbar-color: #555 #333;
          }
          .input-pill textarea::placeholder {
            color: #666;
          }
          .attach-btn,
          .mic-btn {
            background: #333;
            color: #fff;
          }
          .attach-btn:hover,
          .mic-btn:hover {
            background: #444;
          }
          .file-preview {
            background: #333;
          }
          .file-preview-remove {
            color: #999;
          }
          .time {
            color: #666;
          }
          .recording-indicator {
            background: #3f1e1e;
            color: #fca5a5;
          }
        }
      `}</style>

      <div class="app">
        <header class="header">ClawChat</header>

        <div class="messages" ref={messagesContainer}>
          {messages().length === 0 ? (
            <div class="empty">No messages yet</div>
          ) : (
            <For each={messages()}>
              {(msg) => (
                <div class={`message ${msg.role}`}>
                  <div class="bubble">
                    <Show when={msg.content}>{renderContent(msg.content, msg.conversationId)}</Show>
                    <Show when={msg.attachment}>
                      {(att) => (
                        <Show
                          when={isImage(att().mimetype)}
                          fallback={
                            <Show
                              when={isAudio(att().mimetype)}
                              fallback={
                                <a class="file-attachment" href={getFileUrl(msg)} target="_blank" rel="noopener">
                                  <span class="file-icon">📎</span>
                                  <div class="file-info">
                                    <span class="file-name">{att().filename}</span>
                                    <span class="file-size">{formatSize(att().size)}</span>
                                  </div>
                                </a>
                              }
                            >
                              <AudioPlayer src={getFileUrl(msg)} filename={att().filename} />
                            </Show>
                          }
                        >
                          <img
                            src={getFileUrl(msg)}
                            alt={att().filename}
                            onClick={() => openLightbox(getFileUrl(msg), att().filename)}
                            style={{ cursor: 'pointer' }}
                          />
                        </Show>
                      )}
                    </Show>
                  </div>
                  <span class="time">{formatTime(msg.createdAt)}</span>
                </div>
              )}
            </For>
          )}
        </div>

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
      </div>

      <Show when={lightbox()}>
        {(lb) => (
          <div class="lightbox" onClick={() => history.back()}>
            <img src={lb().src} alt={lb().filename} onClick={(e) => e.stopPropagation()} />
            <div class="lightbox-buttons" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => downloadFile(lb().src, lb().filename)}>Download</button>
              <button onClick={() => history.back()}>Close</button>
            </div>
          </div>
        )}
      </Show>
    </>
  );
}
