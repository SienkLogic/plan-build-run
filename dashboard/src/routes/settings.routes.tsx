import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { join } from 'node:path';
import { Layout } from '../components/Layout';
import { SettingsPage } from '../components/settings/SettingsPage';
import { LogViewer } from '../components/settings/LogViewer';
import { LogEntriesFragment } from '../components/settings/LogEntryList';
import { readConfig, writeConfig, mergeDefaults } from '../services/config.service.js';
import { listLogFiles, readLogPage, tailLogFile } from '../services/log.service.js';

type Env = { Variables: { projectDir: string } };
const router = new Hono<Env>();

// GET /settings — full page
router.get('/settings', async (c) => {
  const projectDir = c.get('projectDir');
  const raw = await readConfig(projectDir).catch(() => null);
  const config = mergeDefaults(raw || {});
  const isHtmx = c.req.header('HX-Request');
  const content = <SettingsPage config={config} activeTab="config" />;
  if (isHtmx) return c.html(content);
  return c.html(<Layout title="Settings" currentView="settings">{content}</Layout>);
});

// GET /api/settings/config — return current config as JSON
router.get('/api/settings/config', async (c) => {
  const projectDir = c.get('projectDir');
  const raw = await readConfig(projectDir).catch(() => null);
  const config = mergeDefaults(raw || {});
  return c.json(config);
});

// POST /api/settings/config — save config (form-encoded or raw JSON textarea)
router.post('/api/settings/config', async (c) => {
  const projectDir = c.get('projectDir');
  try {
    const contentType = c.req.header('content-type') || '';
    let newConfig: object;

    if (contentType.includes('application/json')) {
      // Raw JSON mode via JSON body
      newConfig = await c.req.json();
    } else {
      // Form mode or raw textarea: check for rawJson field
      const formData = await c.req.parseBody();

      if (typeof formData['rawJson'] === 'string') {
        // Raw JSON textarea submitted as form field
        newConfig = JSON.parse(formData['rawJson']);
      } else {
        // Standard form mode: reconstruct nested object from flat dotted keys
        const current = await readConfig(projectDir).catch(() => null);
        newConfig = mergeDefaults(current || {});

        // Apply form fields — dotted keys map to nested paths
        for (const [key, value] of Object.entries(formData)) {
          setNestedValue(newConfig as Record<string, unknown>, key, value);
        }

        // Checkboxes: unchecked fields are absent from form data; set them to false
        const boolPaths = getBoolPaths(newConfig);
        for (const path of boolPaths) {
          if (!(path in formData)) {
            setNestedValue(newConfig as Record<string, unknown>, path, false);
          }
        }

        // Coerce number fields
        coerceNumbers(newConfig as Record<string, unknown>);
      }
    }

    await writeConfig(projectDir, newConfig);
    return c.html('<span class="feedback--success">Saved successfully.</span>');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.html(`<span class="feedback--error">Save failed: ${msg}</span>`, 400);
  }
});

// GET /settings/logs — log viewer page
router.get('/settings/logs', async (c) => {
  const projectDir = c.get('projectDir');
  const { file, page, typeFilter, q } = c.req.query();
  const files = await listLogFiles(projectDir).catch(() => []);
  const selectedFile = file || (files[0]?.name ?? '');
  const isLatest = files.length > 0 && selectedFile === files[0].name;

  let entries: object[] = [];
  let total = 0;
  let pageNum = parseInt(page || '1', 10);
  const pageSize = 50;

  if (selectedFile) {
    const filePath = join(projectDir, '.planning', 'logs', selectedFile);
    const result = await readLogPage(filePath, {
      page: pageNum,
      pageSize,
      typeFilter: typeFilter || '',
      q: q || '',
    }).catch(() => ({ entries: [], total: 0, page: pageNum, pageSize }));
    entries = result.entries;
    total = result.total;
    pageNum = result.page;
  }

  const isHtmx = c.req.header('HX-Request');
  const content = (
    <LogViewer
      files={files}
      selectedFile={selectedFile}
      entries={entries}
      total={total}
      page={pageNum}
      pageSize={pageSize}
      typeFilter={typeFilter || ''}
      q={q || ''}
      isLatest={isLatest}
    />
  );
  if (isHtmx) return c.html(content);
  return c.html(<Layout title="Log Viewer" currentView="settings">{content}</Layout>);
});

// GET /api/settings/logs/entries — HTMX partial: paginated entries
router.get('/api/settings/logs/entries', async (c) => {
  const projectDir = c.get('projectDir');
  const { file, page, typeFilter, q } = c.req.query();
  if (!file) return c.html('<p class="log-empty">No file specified.</p>');

  const filePath = join(projectDir, '.planning', 'logs', file);
  const pageNum = parseInt(page || '1', 10);
  const result = await readLogPage(filePath, {
    page: pageNum,
    pageSize: 50,
    typeFilter: typeFilter || '',
    q: q || '',
  }).catch(() => ({ entries: [], total: 0, page: pageNum, pageSize: 50 }));

  return c.html(
    <LogEntriesFragment
      entries={result.entries}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      file={file}
      typeFilter={typeFilter || ''}
      q={q || ''}
    />
  );
});

// GET /api/settings/logs/tail — SSE: stream new log entries
router.get('/api/settings/logs/tail', async (c) => {
  const projectDir = c.get('projectDir');
  const { file } = c.req.query();
  if (!file) return c.json({ error: 'file param required' }, 400);

  const filePath = join(projectDir, '.planning', 'logs', file);
  return streamSSE(c, async (stream) => {
    const stop = await tailLogFile(filePath, (entry) => {
      stream.writeSSE({
        event: 'log-entry',
        data: JSON.stringify(entry),
      }).catch(() => {});
    });

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        stop();
        resolve();
      });
    });
  });
});

export { router as settingsRouter };

/** Set a value at a dotted path on an object, creating intermediate objects as needed. */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value === 'on' ? true : value;
}

/** Collect all dotted paths to boolean fields in the config object. */
function getBoolPaths(obj: unknown, prefix = ''): string[] {
  const paths: string[] = [];
  if (typeof obj !== 'object' || obj === null) return paths;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'boolean') paths.push(fullKey);
    else if (typeof v === 'object' && v !== null) paths.push(...getBoolPaths(v, fullKey));
  }
  return paths;
}

/** Coerce known number fields from string to number after form parse. */
function coerceNumbers(config: Record<string, unknown>) {
  const numberPaths = [
    'parallelization.max_concurrent_agents',
    'parallelization.min_plans_for_parallel',
    'planning.max_tasks_per_plan',
    'local_llm.timeout_ms',
    'local_llm.max_retries',
    'local_llm.metrics.frontier_token_rate',
    'local_llm.advanced.confidence_threshold',
    'local_llm.advanced.max_input_tokens',
    'local_llm.advanced.num_ctx',
    'local_llm.advanced.disable_after_failures',
  ];
  for (const path of numberPaths) {
    const parts = path.split('.');
    let cur: Record<string, unknown> = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object') break;
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (typeof cur[last] === 'string') {
      const n = Number(cur[last]);
      if (!isNaN(n)) cur[last] = n;
    }
  }
}
