import { useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

function PlanningPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();

  const phases = useFetch('/api/planning/phases');
  const status = useFetch('/api/status');

  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const ws = useWebSocket(wsUrl);
  useDocumentTitle({ wsEvents: ws.events });

  useEffect(() => {
    if (ws.events.length > 0) {
      phases.refetch();
      status.refetch();
    }
  }, [ws.events.length, phases.refetch, status.refetch]);

  useEffect(() => {
    if (phases.error && addToast) addToast('error', phases.error.message);
  }, [phases.error, addToast]);

  const isLoading = phases.loading || status.loading;
  const fetchError = phases.error || status.error;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} height={90} />
          ))}
        </div>
        <SkeletonCard height={300} />
      </div>
    );
  }

  if (fetchError) {
    return (
      <ErrorBox
        title="Error loading planning data"
        message={fetchError.message}
        onRetry={() => { phases.refetch(); status.refetch(); }}
      />
    );
  }

  const phaseList = Array.isArray(phases.data) ? phases.data : [];
  const s = status.data || {};

  // Compute summary metrics
  const totalPhases = phaseList.length;
  const totalPlans = phaseList.reduce((sum, p) => sum + (p.plans || []).length, 0);
  const completedPlans = phaseList.reduce((sum, p) => {
    const plans = p.plans || [];
    return sum + plans.filter((pl) => pl.status === 'complete' || pl.summary).length;
  }, 0);
  const completionPct = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  function phaseStatus(p) {
    const plans = p.plans || [];
    if (plans.length === 0) return 'empty';
    const done = plans.filter((pl) => pl.status === 'complete' || pl.summary).length;
    if (done === plans.length) return 'complete';
    if (done > 0) return 'in-progress';
    return 'pending';
  }

  const STATUS_COLORS = {
    complete: t.success,
    'in-progress': t.accent,
    pending: t.textMuted,
    empty: t.textDim,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Planning</SectionTitle>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <MetricCard label="Phases" value={String(totalPhases)} sub="total" color={t.accent} />
        <MetricCard label="Plans" value={String(totalPlans)} sub={`${completedPlans} complete`} color={t.build} />
        <MetricCard label="Progress" value={`${completionPct}%`} sub="completion" color={t.success} />
      </div>

      {/* Current status */}
      {s.phase && (
        <Card style={{ background: `${t.accent}11`, borderColor: `${t.accent}33` }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Current Phase
          </div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 600, color: t.accent }}>
            Phase {s.phase}
          </div>
          {s.stopped_at && (
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.textMuted, marginTop: 2 }}>
              {s.stopped_at}
            </div>
          )}
        </Card>
      )}

      {/* Phase list */}
      {phaseList.length === 0 ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}>&#x25C8;</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No phases found</div>
            <div style={{ fontSize: 11 }}>Planning data appears when .planning/phases/ contains phase directories.</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phaseList.map((phase, i) => {
            const st = phaseStatus(phase);
            const plans = phase.plans || [];
            const donePlans = plans.filter((pl) => pl.status === 'complete' || pl.summary).length;
            return (
              <Card key={phase.slug || i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.text }}>
                      {phase.name || phase.slug || `Phase ${i + 1}`}
                    </div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                      {plans.length} plan{plans.length !== 1 ? 's' : ''}{plans.length > 0 ? ` (${donePlans} done)` : ''}
                    </div>
                  </div>
                  <Badge color={STATUS_COLORS[st]}>{st}</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PlanningPage() {
  return (
    <ErrorBoundary>
      <PlanningPageContent />
    </ErrorBoundary>
  );
}
