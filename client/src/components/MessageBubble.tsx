import { Show, JSX, createSignal, onCleanup } from 'solid-js';
import type { Message } from '@clawchat/shared';
import AudioPlayer from './AudioPlayer';
import { formatTime, formatSize } from '../format';


const WIDGET_IFRAME_RE = /<iframe\s+[^>]*?src="(\/widget\/[^"]+)"/;

interface MessageBubbleProps {
  message: Message;
  onDelete: (id: string) => void;
  onForget: (id: string) => void;
  onImageClick: (src: string, filename: string) => void;
  renderContent: (text: string, messageId: string) => JSX.Element[];
}

export default function MessageBubble(props: MessageBubbleProps) {
  const msg = props.message;
  const [showMenu, setShowMenu] = createSignal(false);

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

  let timeWrapper!: HTMLDivElement;
  let timeEl!: HTMLSpanElement;
  const [menuPos, setMenuPos] = createSignal({ top: 0, left: 0, above: false });

  const handleTimeClick = () => {
    if (!showMenu()) {
      const rect = timeEl.getBoundingClientRect();
      const above = rect.bottom + 100 > window.innerHeight;
      setMenuPos({ top: above ? rect.top : rect.bottom + 4, left: msg.role === 'user' ? rect.right : rect.left, above });
    }
    setShowMenu(!showMenu());
  };

  const handleLink = () => {
    const url = `${location.origin}/#msg-${msg.id}`;
    navigator.clipboard?.writeText(url);
    setShowMenu(false);
  };

  const handleForget = () => {
    setShowMenu(false);
    if (confirm('Delete all messages from this point onwards?')) {
      props.onForget(msg.id);
    }
  };

  // Close menu on outside click
  const onDocClick = (e: MouseEvent) => {
    if (showMenu() && !timeWrapper.contains(e.target as Node)) setShowMenu(false);
  };
  document.addEventListener('click', onDocClick);
  onCleanup(() => document.removeEventListener('click', onDocClick));

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
      <div class="time-wrapper" ref={timeWrapper}>
        <span class="time" ref={timeEl} onClick={handleTimeClick}>{formatTime(msg.createdAt)}</span>
        <Show when={showMenu()}>
          <div class="time-menu" style={{
            position: 'fixed',
            ...(menuPos().above ? { bottom: `${window.innerHeight - menuPos().top + 4}px` } : { top: `${menuPos().top}px` }),
            ...(msg.role === 'user' ? { right: `${window.innerWidth - menuPos().left}px` } : { left: `${menuPos().left}px` }),
          }}>
            <button onClick={handleLink}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg> Copy message link</button>
            <button class="time-menu-danger" onClick={handleForget}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect width="24" height="24" fill="none" stroke="none"/><path d="M3 7h18M8 7V5h8v2M19 7v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7" transform="translate(0,-3.5)"/></svg> Forget from here down</button>
          </div>
        </Show>
      </div>
    </div>
  );
}
