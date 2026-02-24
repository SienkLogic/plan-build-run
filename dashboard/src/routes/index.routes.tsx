import { Hono } from 'hono';
import { Layout } from '../components/Layout';
import { getDashboardData } from '../services/dashboard.service.js';
import { listPendingTodos } from '../services/todo.service.js';
import { StatusHeader } from '../components/partials/StatusHeader';
import { ProgressRing } from '../components/partials/ProgressRing';
import { CurrentPhaseCard } from '../components/partials/CurrentPhaseCard';
import { AttentionPanel } from '../components/partials/AttentionPanel';
import { PhaseTimeline } from '../components/partials/PhaseTimeline';
import { ActivityStream } from '../components/partials/ActivityStream';
import { QuickActions } from '../components/partials/QuickActions';

type Env = {
  Variables: {
    projectDir: string;
  };
};

const router = new Hono<Env>();

router.get('/favicon.ico', (c) => {
  return c.body(null, 204);
});

router.get('/', async (c) => {
  const projectDir = c.get('projectDir');
  const isHtmx = c.req.header('HX-Request');

  const [data, todos] = await Promise.all([
    getDashboardData(projectDir),
    listPendingTodos(projectDir).catch(() => [])
  ]);
  const completed = (data.phases as any[]).filter((p: any) => p.status === 'complete').length;

  const content = (
    <main id="main-content" class="command-center">
      <div
        id="cc-status"
        hx-get="/api/command-center/status"
        hx-trigger="sse:file-change"
        hx-swap="innerHTML"
        hx-ext="sse"
      >
        <StatusHeader
          projectName={data.projectName}
          currentPhase={data.currentPhase}
          completedCount={completed}
          totalCount={(data.phases as any[]).length}
          progress={data.progress}
        />
        <ProgressRing percent={data.progress} />
      </div>

      <div class="command-center__grid">
        <CurrentPhaseCard
          currentPhase={data.currentPhase}
          lastActivity={data.lastActivity}
          nextAction={(data as any).nextAction ?? null}
        />

        <div
          id="attention-panel-wrapper"
          hx-get="/api/command-center/attention"
          hx-trigger="sse:file-change"
          hx-swap="outerHTML"
          hx-ext="sse"
        >
          <AttentionPanel
            todos={todos}
            phases={data.phases as any[]}
            currentPhaseId={data.currentPhase.id}
          />
        </div>

        <QuickActions actions={data.quickActions} />

        <PhaseTimeline
          phases={data.phases as any[]}
          currentPhaseId={data.currentPhase.id}
        />

        <div
          id="activity-stream-wrapper"
          hx-get="/api/command-center/activity"
          hx-trigger="sse:file-change"
          hx-swap="outerHTML"
          hx-ext="sse"
        >
          <ActivityStream activity={data.recentActivity} />
        </div>
      </div>
    </main>
  );

  if (isHtmx) {
    return c.html(content);
  }

  return c.html(
    <Layout title="Command Center" currentView="home">
      {content}
    </Layout>
  );
});

export { router as indexRouter };
