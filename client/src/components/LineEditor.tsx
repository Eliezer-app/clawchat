import { createEffect, onMount, onCleanup, For } from 'solid-js';
import './LineEditor.css';

interface LineEditorProps {
  value: string;
  onInput: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function LineEditor(props: LineEditorProps) {
  let gutterRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let mirrorRef: HTMLDivElement | undefined;

  const lines = () => props.value.split('\n');

  function syncHeights() {
    if (!mirrorRef || !textareaRef || !gutterRef) return;
    mirrorRef.style.width = textareaRef.clientWidth + 'px';

    const texts = props.value.split('\n');

    // Sync mirror child count
    while (mirrorRef.children.length > texts.length) mirrorRef.lastChild!.remove();
    while (mirrorRef.children.length < texts.length) mirrorRef.appendChild(document.createElement('div'));

    for (let i = 0; i < texts.length; i++) {
      (mirrorRef.children[i] as HTMLElement).textContent = texts[i] || ' ';
    }

    // Apply measured heights to gutter numbers
    const nums = gutterRef.children;
    for (let i = 0; i < Math.min(nums.length, mirrorRef.children.length); i++) {
      (nums[i] as HTMLElement).style.height =
        (mirrorRef.children[i] as HTMLElement).offsetHeight + 'px';
    }
  }

  createEffect(() => {
    props.value;
    requestAnimationFrame(syncHeights);
  });

  onMount(() => {
    syncHeights();
    const ro = new ResizeObserver(syncHeights);
    if (textareaRef) ro.observe(textareaRef);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div class="line-editor">
      <div class="line-editor-gutter" ref={gutterRef}>
        <For each={lines()}>
          {(_, i) => <div class="line-editor-num">{i() + 1}</div>}
        </For>
      </div>
      <textarea
        ref={textareaRef}
        class="line-editor-textarea"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onScroll={() => {
          if (gutterRef && textareaRef) gutterRef.scrollTop = textareaRef.scrollTop;
        }}
        disabled={props.disabled}
        placeholder={props.placeholder}
        spellcheck={false}
      />
      <div ref={mirrorRef} class="line-editor-mirror" aria-hidden="true" />
    </div>
  );
}
