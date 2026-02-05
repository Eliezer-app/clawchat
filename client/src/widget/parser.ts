// Extract widget code blocks from message content

const WIDGET_BLOCK_REGEX = /```widget\n([\s\S]*?)```/g;

export interface WidgetBlock {
  code: string;
}

export function extractWidgets(content: string): WidgetBlock[] {
  const widgets: WidgetBlock[] = [];
  let match;
  WIDGET_BLOCK_REGEX.lastIndex = 0;
  while ((match = WIDGET_BLOCK_REGEX.exec(content)) !== null) {
    widgets.push({ code: match[1].trim() });
  }
  return widgets;
}

export function hasWidgets(content: string): boolean {
  WIDGET_BLOCK_REGEX.lastIndex = 0;
  return WIDGET_BLOCK_REGEX.test(content);
}
