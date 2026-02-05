import { Show, JSX, createMemo } from 'solid-js';
import type { Message } from '@clawchat/shared';
import AudioPlayer from './AudioPlayer';
import { formatTime, formatSize } from '../format';
import { stayAtBottomIfNeeded } from '../scrollAnchor';
import { extractWidgets, openWidgetInNewTab } from '../widget';

interface MessageBubbleProps {
  message: Message;
  onDelete: (id: string) => void;
  onImageClick: (src: string, filename: string) => void;
  renderContent: (text: string, conversationId: string) => JSX.Element[];
}

export default function MessageBubble(props: MessageBubbleProps) {
  const msg = props.message;

  const widgets = createMemo(() => extractWidgets(msg.content));

  const handleOpenWidget = () => {
    const w = widgets();
    if (w.length > 0) {
      openWidgetInNewTab(w[0].code, msg.conversationId);
    }
  };

  const getFileUrl = () => {
    if (!msg.attachment) return '';
    const ext = msg.attachment.filename.split('.').pop() || '';
    return `/api/files/${msg.attachment.id}.${ext}`;
  };

  const isImage = (mimetype: string) => mimetype.startsWith('image/');
  const isAudio = (mimetype: string) => mimetype.startsWith('audio/');

  return (
    <div class={`message ${msg.role}`}>
      <div class="bubble">
        <button class="delete-btn" onClick={() => props.onDelete(msg.id)}>×</button>
        <Show when={widgets().length > 0}>
          <button class="open-widget-btn" onClick={handleOpenWidget} title="Open widget in new tab">⧉</button>
        </Show>
        <Show when={msg.content}>{props.renderContent(msg.content, msg.conversationId)}</Show>
        <Show when={msg.attachment}>
          {(att) => (
            <Show
              when={isImage(att().mimetype)}
              fallback={
                <Show
                  when={isAudio(att().mimetype)}
                  fallback={
                    <a class="file-attachment" href={getFileUrl()} target="_blank" rel="noopener">
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
                onLoad={stayAtBottomIfNeeded}
                style={{ cursor: 'pointer' }}
              />
            </Show>
          )}
        </Show>
      </div>
      <span class="time">{formatTime(msg.createdAt)}</span>
    </div>
  );
}
