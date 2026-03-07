import WebSocket from 'ws';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import { getSetting, setSetting } from './db.js';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR = path.join(os.homedir(), '.config/chrome-profiles/eliezer');
const CDP_PORT = 9224;

export type Panel = 'left' | 'right' | 'fullscreen';

export type PanelAction =
  | { action: 'show'; slot: Panel; url: string }
  | { action: 'move'; from: Panel; to: Panel }
  | { action: 'close'; slot: Panel }
  | { action: 'close-all' }
  | { action: 'reload'; slot: Panel }
  | { action: 'clear-cache' }
  | { action: 'split'; left: number; right: number };

interface PanelInfo {
  targetId: string;
  windowId: number;
  url: string;
}

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
  windowState?: string;
}

export class PanelController {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private panels: Record<Panel, PanelInfo | null> = { left: null, right: null, fullscreen: null };
  private screenW = 0;
  private screenH = 0;
  private splitRatio = 1 / 3;

  async connect(): Promise<void> {
    const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const data = await resp.json() as { webSocketDebuggerUrl: string };

    this.ws = new WebSocket(data.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws!.on('open', resolve);
      this.ws!.on('error', reject);
    });

    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    });

    await this.sync();
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Launch Chrome if not already running. */
  static async ensureChrome(): Promise<void> {
    try {
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return; // already running
    } catch {}

    let spawnError: Error | null = null;
    const child = spawn(CHROME_BIN, [
      `--user-data-dir=${PROFILE_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
    ], { detached: true, stdio: 'ignore' });
    child.on('error', (e) => { spawnError = e; });
    child.unref();

    // Wait for CDP to become available
    for (let i = 0; i < 50; i++) {
      if (spawnError) throw spawnError;
      await new Promise(r => setTimeout(r, 100));
      try {
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        return;
      } catch {}
    }
    throw new Error('Chrome did not start in time');
  }

  private boundsFor(panel: Panel): Bounds {
    const leftW = Math.round(this.screenW * this.splitRatio);
    switch (panel) {
      case 'left': return { left: 0, top: 0, width: leftW, height: this.screenH };
      case 'right': return { left: leftW, top: 0, width: this.screenW - leftW, height: this.screenH };
      case 'fullscreen': return { left: 0, top: 0, width: this.screenW, height: this.screenH };
    }
  }

  private async cdp(method: string, params?: Record<string, unknown>): Promise<any> {
    if (!this.ws) throw new Error('Not connected');
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  private async withPageWs<T>(targetId: string, fn: (pageWs: WebSocket) => Promise<T>): Promise<T> {
    const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const list = await targets.json() as { id: string; webSocketDebuggerUrl: string }[];
    const target = list.find(t => t.id === targetId);
    if (!target) throw new Error('Target not found');
    const pageWs = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { pageWs.on('open', resolve); pageWs.on('error', reject); });
    try {
      return await fn(pageWs);
    } finally {
      pageWs.close();
    }
  }

  private async pageCmd(pageWs: WebSocket, method: string, params?: Record<string, unknown>): Promise<any> {
    const id = ++this.msgId;
    pageWs.send(JSON.stringify({ id, method, params }));
    return new Promise(resolve => {
      pageWs.on('message', function handler(raw) {
        const msg = JSON.parse(raw.toString());
        if (msg.id === id) {
          pageWs.off('message', handler);
          resolve(msg.result);
        }
      });
    });
  }

  private async navigateTarget(targetId: string, url: string): Promise<void> {
    await this.withPageWs(targetId, async (pageWs) => {
      await this.pageCmd(pageWs, 'Page.navigate', { url });
    });
  }

  private async detectScreenFrom(targetId: string): Promise<void> {
    await this.withPageWs(targetId, async (pageWs) => {
      const result = await this.pageCmd(pageWs, 'Runtime.evaluate', {
        expression: 'JSON.stringify({w: screen.width, h: screen.height})',
      });
      const { w, h } = JSON.parse(result.result.value);
      this.screenW = w;
      this.screenH = h;
    });
  }

  /** Un-maximize a window if needed, then set its bounds. */
  private async setWindowBounds(windowId: number, bounds: Bounds): Promise<void> {
    // CDP ignores bounds on maximized/fullscreen windows — normalize first
    await this.cdp('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await this.cdp('Browser.setWindowBounds', { windowId, bounds });
  }

  /** Resize all tracked panels to their correct bounds. */
  private async resizeAll(): Promise<void> {
    for (const p of ['left', 'right', 'fullscreen'] as Panel[]) {
      const info = this.panels[p];
      if (info) {
        await this.setWindowBounds(info.windowId, this.boundsFor(p));
      }
    }
  }

  /** Save panel→targetId mapping to DB. */
  private persist(): void {
    const state: Record<string, string> = {};
    for (const p of ['left', 'right', 'fullscreen'] as Panel[]) {
      if (this.panels[p]) state[p] = this.panels[p]!.targetId;
    }
    setSetting('panels', state);
  }

  /** Sync panel state with actual Chrome windows using persisted IDs. */
  async sync(): Promise<void> {
    const result = await this.cdp('Target.getTargets');
    const pages = result.targetInfos.filter((t: any) => t.type === 'page');

    if (!this.screenW && pages.length) {
      await this.detectScreenFrom(pages[0].targetId);
    }

    this.panels = { left: null, right: null, fullscreen: null };
    const saved = getSetting<Record<string, string>>('panels') || {};
    const targetMap = new Map<string, { targetId: string; url: string }>(pages.map((t: any) => [t.targetId, t]));

    for (const p of ['left', 'right', 'fullscreen'] as Panel[]) {
      const targetId = saved[p];
      if (!targetId) continue;
      const t = targetMap.get(targetId);
      if (!t) continue;
      const wResult = await this.cdp('Browser.getWindowForTarget', { targetId });
      this.panels[p] = { targetId, windowId: wResult.windowId, url: t.url };
    }

    await this.resizeAll();
  }

  /** Show a URL in a panel. Reuses existing window if one is already in that slot. */
  async showPanel(panel: Panel, url: string): Promise<void> {
    const existing = this.panels[panel];
    if (existing) {
      try {
        // Verify target still exists
        await this.cdp('Browser.getWindowForTarget', { targetId: existing.targetId });
        if (existing.url !== url) {
          await this.navigateTarget(existing.targetId, url);
          existing.url = url;
        }
      } catch {
        // Target gone — clear stale entry and create a new one below
        this.panels[panel] = null;
      }
    }

    if (!this.panels[panel]) {
      const result = await this.cdp('Target.createTarget', { url, newWindow: true });
      const targetId = result.targetId;
      if (!this.screenW) await this.detectScreenFrom(targetId);
      const wResult = await this.cdp('Browser.getWindowForTarget', { targetId });
      this.panels[panel] = { targetId, windowId: wResult.windowId, url };
    }

    await this.resizeAll();
    await this.cdp('Target.activateTarget', { targetId: this.panels[panel]!.targetId });
    this.persist();
  }

  /** Reload a panel. */
  async reloadPanel(panel: Panel): Promise<void> {
    const info = this.panels[panel];
    if (!info) return;
    await this.navigateTarget(info.targetId, info.url);
  }

  /** Clear HTTP file cache (CSS, JS, images). Does not touch cookies or session. */
  async clearCache(): Promise<void> {
    await this.cdp('Network.clearBrowserCache');
  }

  /** Close a panel. */
  async closePanel(panel: Panel): Promise<void> {
    const info = this.panels[panel];
    if (!info) return;
    await this.cdp('Target.closeTarget', { targetId: info.targetId });
    this.panels[panel] = null;
    this.persist();
  }

  /** Move a panel to a different slot. Closes the destination if occupied. */
  async movePanel(from: Panel, to: Panel): Promise<void> {
    const info = this.panels[from];
    if (!info) return;
    await this.closePanel(to);
    this.panels[to] = info;
    this.panels[from] = null;
    await this.resizeAll();
    this.persist();
  }

  /** Set split ratio and resize existing left/right panels. Fractions must add to 1. */
  async split(leftRatio: number, rightRatio: number): Promise<void> {
    if (Math.abs(leftRatio + rightRatio - 1) > 0.001) {
      throw new Error(`Split ratios must add to 1, got ${leftRatio} + ${rightRatio} = ${leftRatio + rightRatio}`);
    }
    this.splitRatio = leftRatio;
    await this.resizeAll();
  }

  /** Close all panels. */
  async closeAll(): Promise<void> {
    for (const p of ['left', 'right', 'fullscreen'] as Panel[]) {
      await this.closePanel(p);
    }
  }

  /** Execute multiple panel actions in sequence. */
  async showPanels(...actions: PanelAction[]): Promise<void> {
    for (const a of actions) {
      switch (a.action) {
        case 'show': await this.showPanel(a.slot, a.url); break;
        case 'move': await this.movePanel(a.from, a.to); break;
        case 'close': await this.closePanel(a.slot); break;
        case 'reload': await this.reloadPanel(a.slot); break;
        case 'clear-cache': await this.clearCache(); break;
        case 'split': await this.split(a.left, a.right); break;
        case 'close-all': await this.closeAll(); break;
      }
    }
  }

  /** List open panels. */
  listPanels(): { panel: Panel; url: string }[] {
    const result: { panel: Panel; url: string }[] = [];
    for (const p of ['left', 'right', 'fullscreen'] as Panel[]) {
      const info = this.panels[p];
      if (info) result.push({ panel: p, url: info.url });
    }
    return result;
  }
}
