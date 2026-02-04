import { Show } from 'solid-js';

interface LightboxProps {
  src: string;
  filename: string;
  onClose: () => void;
}

export default function Lightbox(props: LightboxProps) {
  const download = async () => {
    const res = await fetch(props.src);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = props.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div class="lightbox" onClick={props.onClose}>
      <img src={props.src} alt={props.filename} onClick={(e) => e.stopPropagation()} />
      <div class="lightbox-buttons" onClick={(e) => e.stopPropagation()}>
        <button onClick={download}>Download</button>
        <button onClick={props.onClose}>Close</button>
      </div>
    </div>
  );
}
