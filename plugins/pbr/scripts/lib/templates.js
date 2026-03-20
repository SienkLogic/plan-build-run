'use strict';

/**
 * templates.cjs -- Spec template system for Plan-Build-Run.
 *
 * Provides built-in templates for common feature types (auth, CRUD, payments).
 * Templates generate PLAN.md-compatible XML task blocks via parameter substitution.
 *
 * Storage: User templates in ~/.claude/templates/ (JSON files)
 *
 * Usage (library):
 *   const { templateList, templateInstantiate } = require('./templates');
 *
 * Usage (CLI via pbr-tools.cjs):
 *   node pbr-tools.cjs templates list
 *   node pbr-tools.cjs templates instantiate auth-oauth --param provider=google ...
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

// --- Constants ---

const USER_TEMPLATES_DIR = path.join(os.homedir(), '.claude', 'templates');

// --- Built-in templates ---

const BUILT_IN_TEMPLATES = {
  'auth-oauth': {
    name: 'auth-oauth',
    description: 'OAuth2 authentication flow with provider integration and session management',
    category: 'auth',
    parameters: [
      { name: 'provider', required: true },
      { name: 'callback_route', required: true },
      { name: 'session_store', required: true },
    ],
    body: [
      '<task id="T1" type="auto" complexity="medium">',
      '<name>Configure {{provider}} OAuth2 client</name>',
      '<files>',
      'src/auth/{{provider}}-client.js',
      'src/auth/oauth-config.js',
      '</files>',
      '<action>',
      '1. Install {{provider}} OAuth2 client library',
      '2. Create oauth-config.js with client ID, secret, and scopes',
      '3. Create {{provider}}-client.js with authorization URL and token exchange',
      '</action>',
      '<verify>',
      '<automated>node -e "require(\'./src/auth/{{provider}}-client.js\')"</automated>',
      '</verify>',
      '<done>{{provider}} OAuth client initialized with correct config</done>',
      '</task>',
      '',
      '<task id="T2" type="auto" complexity="medium">',
      '<name>Implement OAuth middleware with {{session_store}} session store</name>',
      '<files>',
      'src/middleware/auth.js',
      'src/routes/auth.js',
      '</files>',
      '<action>',
      '1. Create auth middleware that validates OAuth tokens',
      '2. Set up {{session_store}} session store for token persistence',
      '3. Add callback handler at {{callback_route}}',
      '4. Add logout route',
      '</action>',
      '<verify>',
      '<automated>npm test -- --testPathPattern="auth" --no-coverage</automated>',
      '</verify>',
      '<done>OAuth middleware handles {{callback_route}} with {{session_store}} sessions</done>',
      '</task>',
    ].join('\n'),
  },

  'crud-rest': {
    name: 'crud-rest',
    description: 'REST API CRUD endpoints with model, routes, and tests',
    category: 'crud',
    parameters: [
      { name: 'resource_name', required: true },
      { name: 'fields', required: true },
      { name: 'db_type', required: true },
    ],
    body: [
      '<task id="T1" type="auto" complexity="low">',
      '<name>Create {{resource_name}} data model for {{db_type}}</name>',
      '<files>',
      'src/models/{{resource_name}}.js',
      'src/migrations/create-{{resource_name}}.js',
      '</files>',
      '<action>',
      '1. Define {{resource_name}} schema with fields: {{fields}}',
      '2. Create {{db_type}} migration',
      '3. Add model validation',
      '</action>',
      '<verify>',
      '<automated>node -e "require(\'./src/models/{{resource_name}}.js\')"</automated>',
      '</verify>',
      '<done>{{resource_name}} model with fields [{{fields}}] migrated on {{db_type}}</done>',
      '</task>',
      '',
      '<task id="T2" type="auto" complexity="medium">',
      '<name>Implement REST routes for {{resource_name}}</name>',
      '<files>',
      'src/routes/{{resource_name}}.js',
      'src/controllers/{{resource_name}}Controller.js',
      '</files>',
      '<action>',
      '1. Create CRUD controller (create, read, update, delete)',
      '2. Register routes: GET /{{resource_name}}, POST /{{resource_name}}, PUT /{{resource_name}}/:id, DELETE /{{resource_name}}/:id',
      '3. Add input validation middleware',
      '</action>',
      '<verify>',
      '<automated>npm test -- --testPathPattern="{{resource_name}}" --no-coverage</automated>',
      '</verify>',
      '<done>{{resource_name}} REST routes respond correctly to CRUD operations</done>',
      '</task>',
      '',
      '<task id="T3" type="auto" tdd="true" complexity="medium">',
      '<name>Write integration tests for {{resource_name}} API</name>',
      '<files>',
      'tests/{{resource_name}}.test.js',
      '</files>',
      '<action>',
      '1. Test POST /{{resource_name}} creates record with {{fields}}',
      '2. Test GET /{{resource_name}} returns list',
      '3. Test PUT /{{resource_name}}/:id updates record',
      '4. Test DELETE /{{resource_name}}/:id removes record',
      '</action>',
      '<verify>',
      '<automated>npm test -- --testPathPattern="{{resource_name}}" --no-coverage</automated>',
      '</verify>',
      '<done>Full CRUD integration tests pass for {{resource_name}}</done>',
      '</task>',
    ].join('\n'),
  },

  'crud-graphql': {
    name: 'crud-graphql',
    description: 'GraphQL schema and resolvers for CRUD operations',
    category: 'crud',
    parameters: [
      { name: 'resource_name', required: true },
      { name: 'fields', required: true },
    ],
    body: [
      '<task id="T1" type="auto" complexity="medium">',
      '<name>Define GraphQL schema for {{resource_name}}</name>',
      '<files>',
      'src/schema/{{resource_name}}.graphql',
      'src/schema/index.js',
      '</files>',
      '<action>',
      '1. Define {{resource_name}} type with fields: {{fields}}',
      '2. Add Query type: get{{resource_name}}, list{{resource_name}}',
      '3. Add Mutation type: create{{resource_name}}, update{{resource_name}}, delete{{resource_name}}',
      '</action>',
      '<verify>',
      '<automated>node -e "require(\'./src/schema/index.js\')"</automated>',
      '</verify>',
      '<done>{{resource_name}} GraphQL schema validates with fields [{{fields}}]</done>',
      '</task>',
      '',
      '<task id="T2" type="auto" complexity="medium">',
      '<name>Implement resolvers for {{resource_name}}</name>',
      '<files>',
      'src/resolvers/{{resource_name}}.js',
      '</files>',
      '<action>',
      '1. Implement query resolvers: get{{resource_name}}, list{{resource_name}}',
      '2. Implement mutation resolvers: create, update, delete',
      '3. Add DataLoader for batched queries',
      '</action>',
      '<verify>',
      '<automated>npm test -- --testPathPattern="{{resource_name}}" --no-coverage</automated>',
      '</verify>',
      '<done>{{resource_name}} resolvers handle all CRUD mutations and queries</done>',
      '</task>',
    ].join('\n'),
  },

  'payments-stripe': {
    name: 'payments-stripe',
    description: 'Stripe checkout session and webhook handler',
    category: 'payments',
    parameters: [
      { name: 'product_model', required: true },
      { name: 'webhook_path', required: true },
    ],
    body: [
      '<task id="T1" type="auto" complexity="medium">',
      '<name>Implement Stripe checkout for {{product_model}}</name>',
      '<files>',
      'src/payments/checkout.js',
      'src/routes/checkout.js',
      '</files>',
      '<action>',
      '1. Install stripe npm package',
      '2. Create checkout session with {{product_model}} price ID',
      '3. Add success and cancel redirect URLs',
      '4. Expose POST /checkout/create-session route',
      '</action>',
      '<verify>',
      '<automated>node -e "require(\'./src/payments/checkout.js\')"</automated>',
      '</verify>',
      '<done>Stripe checkout creates sessions for {{product_model}} purchases</done>',
      '</task>',
      '',
      '<task id="T2" type="auto" complexity="medium">',
      '<name>Implement Stripe webhook handler at {{webhook_path}}</name>',
      '<files>',
      'src/payments/webhook.js',
      'src/routes/webhook.js',
      '</files>',
      '<action>',
      '1. Verify Stripe webhook signature',
      '2. Handle checkout.session.completed event',
      '3. Update {{product_model}} fulfillment status',
      '4. Register handler at {{webhook_path}}',
      '</action>',
      '<verify>',
      '<automated>npm test -- --testPathPattern="webhook" --no-coverage</automated>',
      '</verify>',
      '<done>Webhook at {{webhook_path}} verifies signatures and fulfills {{product_model}} orders</done>',
      '</task>',
    ].join('\n'),
  },
};

// --- Shared audit log helper (re-exported from patterns.cjs logic) ---

function appendAuditLog(logDir, entry) {
  if (!logDir) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'cross-project.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_e) {
    // Non-fatal
  }
}

// --- Core functions ---

/**
 * List all available templates (built-in + user-defined).
 *
 * @param {{ userTemplatesDir?: string, configFeatures?: object }} [options]
 * @returns {Array<{ name, description, parameters, category }> | { enabled: false }}
 */
function templateList(options = {}) {
  const configFeatures = options.configFeatures || {};
  if (configFeatures.spec_templates === false) {
    return { enabled: false };
  }

  const userDir = options.userTemplatesDir || USER_TEMPLATES_DIR;

  // Start with built-ins
  const templates = Object.values(BUILT_IN_TEMPLATES).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    category: t.category,
  }));

  // Load user templates if directory exists
  if (fs.existsSync(userDir)) {
    const files = fs.readdirSync(userDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const userTmpl = JSON.parse(fs.readFileSync(path.join(userDir, file), 'utf8'));
        if (userTmpl.name) {
          templates.push({
            name: userTmpl.name,
            description: userTmpl.description || '',
            parameters: userTmpl.parameters || [],
            category: userTmpl.category || 'custom',
          });
        }
      } catch (_e) {
        // Skip malformed files
      }
    }
  }

  return templates;
}

/**
 * Instantiate a template by substituting parameter placeholders.
 *
 * @param {string} templateName - Template name (built-in or user-defined)
 * @param {object} params - Parameter key-value pairs
 * @param {{ userTemplatesDir?: string, configFeatures?: object, logDir?: string }} [options]
 * @returns {{ template: string, content: string, params_used: object } | { enabled: false }}
 */
function templateInstantiate(templateName, params = {}, options = {}) {
  const configFeatures = options.configFeatures || {};
  if (configFeatures.spec_templates === false) {
    return { enabled: false };
  }

  const userDir = options.userTemplatesDir || USER_TEMPLATES_DIR;
  const logDir = options.logDir;

  // Find template — check built-ins first, then user dir
  let tmpl = BUILT_IN_TEMPLATES[templateName];
  if (!tmpl && fs.existsSync(userDir)) {
    const userFile = path.join(userDir, `${templateName}.json`);
    if (fs.existsSync(userFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(userFile, 'utf8'));
        tmpl = raw;
      } catch (_e) {
        // Fall through to throw
      }
    }
  }

  if (!tmpl) {
    throw new Error(`Template not found: "${templateName}". Available: ${Object.keys(BUILT_IN_TEMPLATES).join(', ')}`);
  }

  // Validate required parameters
  const missing = (tmpl.parameters || [])
    .filter(p => p.required && (params[p.name] === undefined || params[p.name] === null || params[p.name] === ''));
  if (missing.length > 0) {
    throw new Error(`Missing required parameters for template "${templateName}": ${missing.map(p => p.name).join(', ')}`);
  }

  // Substitute {{param}} placeholders
  let content = tmpl.body || '';
  for (const [key, value] of Object.entries(params)) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    content = content.replace(re, String(value));
  }

  appendAuditLog(logDir, {
    timestamp: new Date().toISOString(),
    operation: 'template-instantiate',
    feature: 'spec_templates',
    detail: { template: templateName, params_used: params },
  });

  return {
    template: templateName,
    content,
    params_used: { ...params },
  };
}

// --- Exports ---

module.exports = {
  USER_TEMPLATES_DIR,
  BUILT_IN_TEMPLATES,
  templateList,
  templateInstantiate,
};
