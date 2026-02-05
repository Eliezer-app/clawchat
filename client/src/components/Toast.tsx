import { Show } from 'solid-js';
import './Toast.css';

interface ToastProps {
  message: string | null;
  type: 'success' | 'error';
}

export default function Toast(props: ToastProps) {
  return (
    <Show when={props.message}>
      <div class={`toast toast-${props.type}`}>
        {props.message}
      </div>
    </Show>
  );
}
