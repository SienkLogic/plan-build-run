import { Hono } from 'hono';
import { Layout } from '../components/Layout';
import { TimelinePage, EventStreamFragment } from '../components/timeline/TimelinePage';
import { getTimelineEvents } from '../services/timeline.service.js';

type Env = { Variables: { projectDir: string } };

const router = new Hono<Env>();

router.get('/timeline', async (c) => {
  const isHtmx = c.req.header('HX-Request');
  const content = (
    <div class="timeline">
      <h1 class="page-title">Timeline</h1>
      <TimelinePage />
    </div>
  );
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

export { router as timelineRouter };
