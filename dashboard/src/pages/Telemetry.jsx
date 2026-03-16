import { useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, ErrorBoundary } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import { SuccessTrend } from '../components/charts/index.js';
import { ContextRadar } from '../components/charts/index.js';
import { BudgetBars } from '../components/charts/index.js';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useToast from '../hooks/useToast.jsx';

function TelemetryContent() {
  const { tokens } = useTheme();
  const { addToast } = useToast();
  const { data, loading, error, refetch } = useFetch('/api/telemetry');
  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { events: wsEvents } = useWebSocket(wsUrl);

  useEffect(() => {
    if (wsEvents.length > 0) refetch();
  }, [wsEvents.length, refetch]);

  useEffect(() => {
    if (error) addToast('error', error.message);
  }, [error, addToast]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} height={90} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SkeletonCard height={220} />
          <SkeletonCard height={220} />
        </div>
        <SkeletonCard height={220} />
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ border: `1px solid ${tokens.error}`, color: tokens.error }}>
        <SectionTitle>Error loading telemetry</SectionTitle>
        <div style={{ fontFamily: FONTS.mono, fontSize: 12 }}>{error.message}</div>
      </Card>
    );
  }

  const d = data || {};
  const avgTokens = d.avgTokens || '0';
  const avgTime = d.avgTime || '0s';
  const compression = d.compression || '0x';
  const cost = d.cost || '$0.00';

  const successHistory = d.successHistory || [];
  const contextBalance = d.contextBalance || [];
  const subagentBudgets = d.subagentBudgets || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Metric cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
        }}
      >
        <MetricCard label="Avg Tokens/SA" value={String(avgTokens)} color={tokens.accent} />
        <MetricCard label="Avg Time" value={String(avgTime)} color={tokens.warning} />
        <MetricCard label="Compression" value={String(compression)} color={tokens.success} />
        <MetricCard label="Cost" value={String(cost)} color={tokens.plan} />
      </div>

      {/* Two-column chart row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <Card>
          <SectionTitle>Success Trend</SectionTitle>
          <SuccessTrend data={successHistory} />
        </Card>
        <Card>
          <SectionTitle>Context Radar</SectionTitle>
          <ContextRadar data={contextBalance} />
        </Card>
      </div>

      {/* Budget chart */}
      <Card>
        <SectionTitle>Token Budget</SectionTitle>
        <BudgetBars data={subagentBudgets} />
      </Card>
    </div>
  );
}

export default function Telemetry() {
  return (
    <ErrorBoundary>
      <TelemetryContent />
    </ErrorBoundary>
  );
}
