import { createSignal } from 'solid-js';
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

export default function CodeBlock(props: { lang: string; code: string }) {
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
