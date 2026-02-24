import { Hono } from 'hono';
import { Layout } from '../components/Layout';
import { ExplorerPage } from '../components/explorer/ExplorerPage';
import { PhasesTab, PhaseDetailFragment, PhaseDocFragment } from '../components/explorer/tabs/PhasesTab';
import { TodosTab, TodoListFragment, TodoCreateForm } from '../components/explorer/tabs/TodosTab';
import { MilestonesTab, milestoneDetailHtml } from '../components/explorer/tabs/MilestonesTab';
import { getRoadmapData } from '../services/roadmap.service.js';
import { getPhaseDetail, getPhaseDocument } from '../services/phase.service.js';
import { listPendingTodos, listDoneTodos, createTodo, completeTodo } from '../services/todo.service.js';
import { getAllMilestones, getMilestoneDetail } from '../services/milestone.service.js';

type Env = { Variables: { projectDir: string } };

const router = new Hono<Env>();

// ---- Full Explorer page (with Layout) or partial for HTMX ----

router.get('/explorer', async (c) => {
  const isHtmx = c.req.header('HX-Request');
  const content = (
    <div class="explorer-wrapper">
      <h1 class="page-title">Explorer</h1>
      <ExplorerPage />
    </div>
  );
  if (isHtmx) return c.html(content);
  return c.html(<Layout title="Explorer" currentView="explorer">{content}</Layout>);
});

// ---- Phases tab content ----

router.get('/api/explorer/phases', async (c) => {
  const projectDir = c.get('projectDir');
  const roadmap = await getRoadmapData(projectDir).catch(() => ({ phases: [] }));
  return c.html(<PhasesTab phases={(roadmap as any).phases as any[]} />);
});

// ---- Phase detail (plan list) ----

router.get('/api/explorer/phases/:phaseId', async (c) => {
  const projectDir = c.get('projectDir');
  const { phaseId } = c.req.param();
  const detail = await getPhaseDetail(projectDir, phaseId).catch(() => null);
  if (!detail) {
    return c.html(<p class="explorer__loading">Phase not found.</p>);
  }
  return c.html(<PhaseDetailFragment phase={detail as any} phaseId={phaseId} />);
});

// ---- Individual document (plan / summary / verification) ----

router.get('/api/explorer/phases/:phaseId/:planId/:docType', async (c) => {
  const projectDir = c.get('projectDir');
  const { phaseId, planId, docType } = c.req.param();
  const doc = await getPhaseDocument(projectDir, phaseId, planId, docType).catch(() => null);
  if (!doc) {
    return c.html(
      <p style="color: var(--color-text-dim); padding: var(--space-sm)">
        Document not available.
      </p>
    );
  }
  return c.html(<PhaseDocFragment doc={doc as any} />);
});

// ---- Todos tab routes ----

// Full todos tab content
router.get('/api/explorer/todos', async (c) => {
  const projectDir = c.get('projectDir');
  const todos = await listPendingTodos(projectDir).catch(() => []);
  return c.html(<TodosTab todos={todos as any[]} />);
});

// Pending list (refreshed after create)
router.get('/api/explorer/todos/list', async (c) => {
  const projectDir = c.get('projectDir');
  const todos = await listPendingTodos(projectDir).catch(() => []);
  return c.html(<TodoListFragment todos={todos as any[]} />);
});

// Done list
router.get('/api/explorer/todos/done', async (c) => {
  const projectDir = c.get('projectDir');
  const done = await listDoneTodos(projectDir).catch(() => []);
  const html =
    done.length === 0
      ? '<p class="explorer__loading">No completed todos.</p>'
      : `<ul class="explorer-list">${done
          .map(
            (t: any) =>
              `<li class="explorer-item"><div class="explorer-item__header">
            <span class="explorer-badge explorer-badge--complete">done</span>
            <span class="explorer-item__title">${t.title}</span>
            <span class="explorer-item__meta">${t.completedAt ? new Date(t.completedAt).toLocaleDateString() : ''}</span>
          </div></li>`
          )
          .join('')}</ul>`;
  return c.html(html);
});

// Create todo
router.post('/api/explorer/todos', async (c) => {
  const projectDir = c.get('projectDir');
  const body = await c.req.parseBody();
  const title = String(body.title || '').trim();
  const priority = String(body.priority || 'medium');
  const phase = body.phase ? String(body.phase).trim() : undefined;
  const description = body.description ? String(body.description).trim() : undefined;
  if (!title) return c.html('<p class="explorer__loading">Title required.</p>', 400);
  await createTodo(projectDir, { title, priority, description: description ?? '', phase });
  const todos = await listPendingTodos(projectDir).catch(() => []);
  return c.html(<TodoListFragment todos={todos as any[]} />);
});

// Complete todo
router.post('/api/explorer/todos/:id/complete', async (c) => {
  const projectDir = c.get('projectDir');
  const { id } = c.req.param();
  await completeTodo(projectDir, id).catch(() => {});
  // Return empty string — HTMX outerHTML swap removes the list item
  return c.html('');
});

// ---- Milestones tab routes ----

// Milestones tab full content
router.get('/api/explorer/milestones', async (c) => {
  const projectDir = c.get('projectDir');
  const { active, archived } = await getAllMilestones(projectDir).catch(() => ({
    active: [],
    archived: [],
  }));
  return c.html(<MilestonesTab active={active as any[]} archived={archived as any[]} />);
});

// Milestone detail
router.get('/api/explorer/milestones/:version', async (c) => {
  const projectDir = c.get('projectDir');
  const { version } = c.req.param();
  const detail = await getMilestoneDetail(projectDir, version).catch(() => null);
  return c.html(milestoneDetailHtml(detail));
});

// ---- Stub endpoints for tabs implemented in later plans ----

const STUB_TABS = ['research', 'requirements', 'notes', 'audits', 'quick'] as const;

for (const tab of STUB_TABS) {
  router.get(`/api/explorer/${tab}`, (c) =>
    c.html(<div class="explorer__loading">Coming soon...</div>)
  );
}

export { router as explorerRouter };
