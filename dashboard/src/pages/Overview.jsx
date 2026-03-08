import { useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, StatusDot, ErrorBoundary, PipelineView, AutoModeBanner, ProgressDisplay, NextUpBlock, CheckpointBox, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import { TokenChart, PhaseDonut } from '../components/charts/index.js';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

const PHASE_COLORS = { Plan: 'plan', Build: 'build', Run: 'run' };

function deriveNextCommand(s) {
  const stopped = (s.stopped_at || '').toLowerCase();
  if (stopped.includes('context')) return '$pbr:plan';
  if (stopped.includes('plan')) return '$pbr:build';
  if (stopped.includes('build')) return '$pbr:review';
  if (stopped.includes('review')) return '$pbr:run';
  return '$pbr:continue';
}

function OverviewContent({ project }) {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();
  const status = useFetch('/api/status');
  const telemetry = useFetch('/api/telemetry');
  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const ws = useWebSocket(wsUrl);
  useDocumentTitle({ wsEvents: ws.events });

  useEffect(() => {
    if (ws.events.length > 0) {
      status.refetch();
      telemetry.refetch();
    }
  }, [ws.events.length, status, telemetry]);

  useEffect(() => {
    if (status.error) addToast('error', status.error.message);
  }, [status.error, addToast]);

  useEffect(() => {
    if (telemetry.error) addToast('error', telemetry.error.message);
  }, [telemetry.error, addToast]);

  const isLoading = status.loading || telemetry.loading;
  const fetchError = status.error || telemetry.error;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SkeletonCard height={80} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} height={90} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <SkeletonCard height={220} />
          <SkeletonCard height={220} />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <ErrorBox
        title="Error loading data"
        message={fetchError.message}
        onRetry={() => { status.refetch(); telemetry.refetch(); }}
      />
    );
  }

  const s = status.data || {};
  const tel = telemetry.data || {};

  const proj = project || { name: s.project || 'My Project', repo: s.repo || 'user/repo', branch: s.branch || 'main' };
  const phase = s.phase || 'Build';

  const pills = ['Plan', 'Build', 'Run'];
  const activePill = phase;

  const tokenHistory = tel.tokenHistory || [];
  const phaseDist = tel.phaseDistribution || [];
  const subagentPerf = tel.subagents || s.subagents || [];

  const subagentCount = subagentPerf.length || 0;
  const totalTokens = subagentPerf.reduce((sum, sa) => sum + (sa.tokens || 0), 0);
  const successCount = subagentPerf.filter((sa) => sa.status === 'success').length;
  const successRate = subagentCount > 0 ? Math.round((successCount / subagentCount) * 100) : 0;
  const contextUsed = s.contextUsed || tel.contextUsed || 0;
  const cost = s.cost || tel.cost || 0;

  // Pipeline stage derivation from status data
  const PIPELINE_STAGES = [
    { id: 'questioning', label: 'Question' },
    { id: 'research', label: 'Research' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'plan', label: 'Plan' },
    { id: 'build', label: 'Build' },
    { id: 'review', label: 'Review' },
  ];
  const stoppedAt = s.stopped_at || s.status || '';
  const currentStageId = stoppedAt.toLowerCase().includes('build') ? 'build'
    : stoppedAt.toLowerCase().includes('plan') ? 'plan'
    : stoppedAt.toLowerCase().includes('review') ? 'review'
    : stoppedAt.toLowerCase().includes('roadmap') ? 'roadmap'
    : stoppedAt.toLowerCase().includes('research') ? 'research'
    : stoppedAt.toLowerCase().includes('requirement') ? 'requirements'
    : stoppedAt.toLowerCase().includes('question') ? 'questioning'
    : 'build';

  // Context budget data
  const budgetTotal = s.budgetTotal || tel.budgetTotal || 200000;
  const budgetUsed = s.budgetUsed || tel.budgetUsed || 0;
  const budgetProjected = s.budgetProjected || tel.budgetProjected || 0;
  const budgetPct = budgetTotal > 0 ? Math.round((budgetUsed / budgetTotal) * 100) : 0;
  const budgetColor = budgetPct > 70 ? t.warning : t.plan;

  // Auto mode data
  const autoMode = s.autoMode || tel.autoMode || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Auto-mode banner */}
      <AutoModeBanner autoMode={autoMode} />

      {/* Session banner */}
      <Card
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, ${t.plan}, ${t.build}, ${t.run})`,
          }}
        />
        <div>
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: 10,
              color: t.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              marginBottom: 4,
            }}
          >
            Current Session
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: t.accent,
              fontFamily: FONTS.sans,
            }}
          >
            {proj.name}
          </div>
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: 11,
              color: t.textMuted,
              marginTop: 2,
            }}
          >
            {proj.repo} / {proj.branch}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {pills.map((p) => (
            <span
              key={p}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontFamily: FONTS.mono,
                fontSize: 11,
                fontWeight: p === activePill ? 700 : 400,
                background: p === activePill ? `${t[PHASE_COLORS[p]]}22` : 'transparent',
                color: p === activePill ? t[PHASE_COLORS[p]] : t.textDim,
                border: `1px solid ${p === activePill ? t[PHASE_COLORS[p]] + '44' : t.border}`,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </Card>

      {/* Pipeline tracker */}
      <Card>
        <SectionTitle>Pipeline</SectionTitle>
        <PipelineView stages={PIPELINE_STAGES} currentStage={currentStageId} />
      </Card>

      {/* Workflow status checkpoint */}
      <CheckpointBox
        title="Workflow Status"
        status={currentStageId === 'review' ? 'passed' : 'pending'}
        items={PIPELINE_STAGES.map((stage, idx) => ({
          label: stage.label,
          checked: idx <= PIPELINE_STAGES.findIndex((ps) => ps.id === currentStageId),
        }))}
        readOnly={true}
      />

      {/* 5 metric cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
        }}
      >
        <MetricCard label="Subagents" value={String(subagentCount)} sub="active this session" color={t.build} />
        <MetricCard label="Tokens" value={totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : String(totalTokens)} sub="input + output" color={t.accent} />
        <MetricCard label="Success" value={`${successRate}%`} sub="pass rate" color={t.success} />
        <MetricCard label="Context" value={typeof contextUsed === 'number' ? `${contextUsed}%` : String(contextUsed)} sub="budget used" color={t.plan} />
        <MetricCard label="Cost" value={typeof cost === 'number' ? `$${cost.toFixed(2)}` : String(cost)} sub="estimated" color={t.info} />
      </div>

      {/* Context budget gauge */}
      {budgetUsed > 0 && (
        <ProgressDisplay
          label="Context Budget"
          value={budgetUsed}
          total={budgetTotal}
          sub={budgetProjected > 0 ? `Projected: ${budgetProjected.toLocaleString()} tokens` : undefined}
          color={budgetColor}
        />
      )}

      {/* Charts row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 12,
        }}
      >
        <Card>
          <SectionTitle>Token Usage</SectionTitle>
          <TokenChart data={tokenHistory} />
        </Card>
        <Card>
          <SectionTitle>Phases</SectionTitle>
          <PhaseDonut data={phaseDist} />
        </Card>
      </div>

      {/* Next action block */}
      {s.stopped_at && (
        <NextUpBlock
          command={deriveNextCommand(s)}
          phaseName={s.stopped_at}
        />
      )}

      {/* Subagent activity table */}
      <Card>
        <SectionTitle>Subagent Activity</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: FONTS.mono,
              fontSize: 11,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: `1px solid ${t.border}`,
                  textAlign: 'left',
                }}
              >
                {['Agent', 'Task', 'Phase', 'Model', 'Tokens', 'Time', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 8px',
                      color: t.textMuted,
                      fontWeight: 600,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subagentPerf.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: `1px solid ${t.border}`,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = t.surfaceAlt;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <td style={{ padding: '7px 8px', color: t.accent, fontWeight: 600 }}>
                    {row.name}
                  </td>
                  <td style={{ padding: '7px 8px', color: t.text }}>{row.task}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <Badge color={t[PHASE_COLORS[row.phase]]}>{row.phase}</Badge>
                  </td>
                  <td style={{ padding: '7px 8px', color: t.textMuted }}>{row.model}</td>
                  <td style={{ padding: '7px 8px', color: t.text }}>
                    {(row.tokens / 1000).toFixed(1)}K
                  </td>
                  <td style={{ padding: '7px 8px', color: t.textMuted }}>{row.time}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <StatusDot status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function Overview({ project }) {
  return (
    <ErrorBoundary>
      <OverviewContent project={project} />
    </ErrorBoundary>
  );
}
