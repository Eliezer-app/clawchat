import { createSignal, onMount, onCleanup } from 'solid-js';

export default function AudioPlayer(props: { src: string; filename?: string }) {
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
