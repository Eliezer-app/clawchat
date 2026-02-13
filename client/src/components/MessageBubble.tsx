import { Show, JSX } from 'solid-js';
import type { Message } from '@clawchat/shared';
import AudioPlayer from './AudioPlayer';
import { formatTime, formatSize } from '../format';


const WIDGET_IFRAME_RE = /<iframe\s+[^>]*?src="(\/widget\/[^"]+)"/;

interface MessageBubbleProps {
  message: Message;
  onDelete: (id: string) => void;
  onImageClick: (src: string, filename: string) => void;
  renderContent: (text: string, messageId: string) => JSX.Element[];
}

export default function MessageBubble(props: MessageBubbleProps) {
  const msg = props.message;

  const widgetSrc = () => {
    const match = msg.content.match(WIDGET_IFRAME_RE);
    return match ? match[1] : null;
  };

  const handleOpenWidget = () => {
    const src = widgetSrc();
    if (src) window.open(src, '_blank');
  };

  const getFileUrl = () => {
    if (!msg.attachment) return '';
    return `/chat-public/${msg.attachment.filename}`;
  };

  const isImage = (mimetype: string) => mimetype.startsWith('image/');
  const isAudio = (mimetype: string) => mimetype.startsWith('audio/');

  return (
    <div id={`msg-${msg.id}`} class={`message ${msg.role}`}>
      <div class="bubble">
        <button class="delete-btn" onClick={() => props.onDelete(msg.id)}>×</button>
        <Show when={widgetSrc()}>
          <button class="open-widget-btn" onClick={handleOpenWidget} title="Open widget in new tab">⧉</button>
        </Show>
        <Show when={msg.content}>{props.renderContent(msg.content, msg.id)}</Show>
        <Show when={msg.attachment}>
          {(att) => (
            <Show
              when={isImage(att().mimetype)}
              fallback={
                <Show
                  when={isAudio(att().mimetype)}
                  fallback={
                    <a class="file-attachment" href={getFileUrl()} download={att().filename}>
                      <span class="file-icon">📎</span>
                      <div class="file-info">
                        <span class="file-name">{att().filename}</span>
                        <span class="file-size">{formatSize(att().size)}</span>
                      </div>
                    </a>
                  }
                >
                  <AudioPlayer src={getFileUrl()} filename={att().filename} />
                </Show>
              }
            >
              <img
                src={getFileUrl()}
                alt={att().filename}
                loading="lazy"
                onClick={() => props.onImageClick(getFileUrl(), att().filename)}
                style={{ cursor: 'pointer' }}
              />
            </Show>
          )}
        </Show>
      </div>
      <a class="time" href={`#msg-${msg.id}`}>{formatTime(msg.createdAt)}</a>
    </div>
  );
}
