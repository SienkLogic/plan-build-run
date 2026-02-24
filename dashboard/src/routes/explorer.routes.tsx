import { Hono } from 'hono';
import { Layout } from '../components/Layout';
import { ExplorerPage } from '../components/explorer/ExplorerPage';
import { PhasesTab, PhaseDetailFragment, PhaseDocFragment } from '../components/explorer/tabs/PhasesTab';
import { getRoadmapData } from '../services/roadmap.service.js';
import { getPhaseDetail, getPhaseDocument } from '../services/phase.service.js';

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

// ---- Stub endpoints for tabs implemented in later plans ----

const STUB_TABS = ['todos', 'milestones', 'research', 'requirements', 'notes', 'audits', 'quick'] as const;

for (const tab of STUB_TABS) {
  router.get(`/api/explorer/${tab}`, (c) =>
    c.html(<div class="explorer__loading">Coming soon...</div>)
  );
}

export { router as explorerRouter };
