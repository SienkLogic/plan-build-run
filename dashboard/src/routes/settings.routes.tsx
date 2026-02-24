import { Hono } from 'hono';
import { Layout } from '../components/Layout';
import { SettingsPage } from '../components/settings/SettingsPage';
import { readConfig, writeConfig, mergeDefaults } from '../services/config.service.js';

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
