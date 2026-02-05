// Extract widget code blocks from message content

const WIDGET_BLOCK_REGEX = /```widget\n([\s\S]*?)```/g;

export function extractWidgets(content: string): string[] {
  const widgets: string[] = [];
  let match;
  while ((match = WIDGET_BLOCK_REGEX.exec(content)) !== null) {
    widgets.push(match[1].trim());
  }
  return widgets;
}

export function hasWidgets(content: string): boolean {
  return WIDGET_BLOCK_REGEX.test(content);
}
