import { Hono } from 'hono';
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

async function fetchAllData(projectDir: string) {
  const [data, todos] = await Promise.all([
    getDashboardData(projectDir),
    listPendingTodos(projectDir).catch(() => [])
  ]);
  const completed = (data.phases as any[]).filter((p: any) => p.status === 'complete').length;
  return { data, todos, completed };
}

router.get('/status', async (c) => {
  const projectDir = c.get('projectDir');
  const { data, completed } = await fetchAllData(projectDir);
  return c.html(
    <div id="cc-status">
      <StatusHeader
        projectName={data.projectName}
        currentPhase={data.currentPhase}
        completedCount={completed}
        totalCount={(data.phases as any[]).length}
        progress={data.progress}
      />
      <ProgressRing percent={data.progress} />
    </div>
  );
});

router.get('/activity', async (c) => {
  const projectDir = c.get('projectDir');
  const data = await getDashboardData(projectDir);
  return c.html(<ActivityStream activity={data.recentActivity} />);
});

router.get('/attention', async (c) => {
  const projectDir = c.get('projectDir');
  const { data, todos } = await fetchAllData(projectDir);
  return c.html(
    <AttentionPanel
      todos={todos}
      phases={data.phases as any[]}
      currentPhaseId={data.currentPhase.id}
    />
  );
});

// Unused components imported but available for future routes
void CurrentPhaseCard;
void PhaseTimeline;
void QuickActions;

export { router as commandCenterRouter };
