import { Hono } from 'hono';
import { Layout } from '../components/Layout';
import { TimelinePage, EventStreamFragment } from '../components/timeline/TimelinePage';
import { AnalyticsPanelFragment } from '../components/timeline/AnalyticsPanel';
import { DependencyGraphFragment } from '../components/timeline/DependencyGraph';
import { getTimelineEvents } from '../services/timeline.service.js';
import { getProjectAnalytics } from '../services/analytics.service.js';
import { getLlmMetrics } from '../services/local-llm-metrics.service.js';
import { generateDependencyMermaid } from '../services/roadmap.service.js';

type Env = { Variables: { projectDir: string } };

const router = new Hono<Env>();

router.get('/timeline', async (c) => {
  const isHtmx = c.req.header('HX-Request');
  const content = <TimelinePage />;
  if (isHtmx) return c.html(content);
  return c.html(<Layout title="Timeline" currentView="timeline">{content}</Layout>);
});

router.get('/api/timeline/events', async (c) => {
  const projectDir = c.get('projectDir');
  const { types, phase, dateFrom, dateTo } = c.req.query();
  const filters = {
    types: types ? (Array.isArray(types) ? types : [types]) : [],
    phase: phase || '',
    dateFrom: dateFrom || '',
    dateTo: dateTo || ''
  };
  const events = await getTimelineEvents(projectDir, filters).catch(() => []);
  return c.html(<EventStreamFragment events={events} />);
});

router.get('/api/timeline/analytics', async (c) => {
  const projectDir = c.get('projectDir');
  const [analytics, llmMetrics] = await Promise.all([
    getProjectAnalytics(projectDir).catch(() => ({ phases: [], summary: {} })),
    getLlmMetrics(projectDir).catch(() => null)
  ]);
  return c.html(<AnalyticsPanelFragment analytics={analytics} llmMetrics={llmMetrics} />);
});

router.get('/api/timeline/dependency-graph', async (c) => {
  const projectDir = c.get('projectDir');
  const mermaidDef = await generateDependencyMermaid(projectDir).catch(() => 'graph TD\n  err["Could not load graph"]');
  return c.html(<DependencyGraphFragment mermaidDef={mermaidDef} />);
});

export { router as timelineRouter };
