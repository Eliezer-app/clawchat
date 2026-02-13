import express from 'express';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const appsDir = resolve(import.meta.dirname, '../../apps');
const port = process.env.WIDGET_SERVER_PORT || 3103;

const app = express();
app.use(express.json());

// Scan apps/ for handler files and mount each
const entries = readdirSync(appsDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const handlerPath = join(appsDir, entry.name, 'index.mts');
  if (!existsSync(handlerPath)) continue;

  try {
    const mod = await import(handlerPath);
    const router = express.Router();
    mod.default(router);
    app.use(`/${entry.name}`, router);
    console.log(`[Widget] ${entry.name}`);
  } catch (err) {
    console.error(`[Widget] Failed to load ${entry.name}:`, err);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
  console.log(`Widget server on port ${port}`);
});
