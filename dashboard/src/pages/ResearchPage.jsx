import { useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

const STATUS_COLORS = {
  collected: '#3b82f6',
  synthesized: '#8b5cf6',
  analyzed: '#10b981',
};

function ResearchPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();

  const { data, loading, error, refetch } = useFetch('/api/planning/research');

  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const ws = useWebSocket(wsUrl);
  useDocumentTitle({ wsEvents: ws.events });

  useEffect(() => {
    if (ws.events.length > 0) {
      refetch();
    }
  }, [ws.events.length, refetch]);

  useEffect(() => {
    if (error && addToast) addToast('error', error.message);
  }, [error, addToast]);

  if (loading) {
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

  if (error) {
    return (
      <ErrorBox
        title="Error loading research"
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  const entries = Array.isArray(data) ? data : [];
  const collected = entries.filter((e) => e.status === 'collected').length;
  const synthesized = entries.filter((e) => e.status === 'synthesized').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Research</SectionTitle>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <MetricCard label="Documents" value={String(entries.length)} sub="total research" color={t.accent} />
        <MetricCard label="Collected" value={String(collected)} sub="gathered" color={STATUS_COLORS.collected} />
        <MetricCard label="Synthesized" value={String(synthesized)} sub="processed" color={STATUS_COLORS.synthesized} />
      </div>

      {/* Research entries */}
      {entries.length === 0 ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}>&#x25C8;</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No research documents</div>
            <div style={{ fontSize: 11 }}>Research documents appear when .planning/research/ contains files.</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((entry, i) => (
            <Card key={entry.id || i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.accent }}>
                  {entry.title}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  <Badge color={STATUS_COLORS[entry.status] || t.textMuted}>{entry.status}</Badge>
                  {entry.source && <Badge color={t.build}>{entry.source}</Badge>}
                </div>
              </div>
              {entry.date && (
                <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.textMuted, marginBottom: 6 }}>
                  {entry.date}
                </div>
              )}
              {entry.summary && (
                <div style={{
                  fontFamily: FONTS.sans,
                  fontSize: 12,
                  color: t.textMuted,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  maxHeight: 80,
                }}>
                  {entry.summary.length > 300 ? entry.summary.slice(0, 300) + '...' : entry.summary}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResearchPage() {
  return (
    <ErrorBoundary>
      <ResearchPageContent />
    </ErrorBoundary>
  );
}
