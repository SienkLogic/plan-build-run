import { useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

const SEVERITY_COLORS = {
  error: '#ef4444',
  warning: '#eab308',
  info: '#3b82f6',
};

function IncidentsPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();

  const { data, loading, error, refetch } = useFetch('/api/incidents');

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
          {[1, 2, 3, 4].map((i) => (
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
        title="Error loading incidents"
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  const incidents = Array.isArray(data) ? data : [];
  const sorted = [...incidents].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  const errorCount = incidents.filter((inc) => inc.severity === 'error').length;
  const warningCount = incidents.filter((inc) => inc.severity === 'warning').length;
  const infoCount = incidents.filter((inc) => inc.severity === 'info').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Incidents</SectionTitle>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <MetricCard label="Total" value={String(incidents.length)} sub="incidents" color={t.accent} />
        <MetricCard label="Errors" value={String(errorCount)} sub="critical" color={SEVERITY_COLORS.error} />
        <MetricCard label="Warnings" value={String(warningCount)} sub="attention" color={SEVERITY_COLORS.warning} />
        <MetricCard label="Info" value={String(infoCount)} sub="informational" color={SEVERITY_COLORS.info} />
      </div>

      {/* Incidents list */}
      {sorted.length === 0 ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}>&#x25C8;</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No incidents recorded</div>
            <div style={{ fontSize: 11 }}>Incidents appear when .planning/incidents/ contains JSONL files.</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map((inc, i) => (
            <Card key={inc.id || i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge color={SEVERITY_COLORS[inc.severity] || t.textMuted}>
                    {inc.severity || 'unknown'}
                  </Badge>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: t.textMuted }}>
                    {inc.type || 'incident'}
                  </span>
                </div>
                {inc.timestamp && (
                  <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.textMuted, flexShrink: 0, marginLeft: 12 }}>
                    {new Date(inc.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
              {inc.message && (
                <div style={{ fontFamily: FONTS.sans, fontSize: 12, color: t.text, lineHeight: 1.5 }}>
                  {inc.message}
                </div>
              )}
              {inc.context && (
                <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.textMuted, marginTop: 6, whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 60 }}>
                  {typeof inc.context === 'string' ? inc.context : JSON.stringify(inc.context, null, 2)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <ErrorBoundary>
      <IncidentsPageContent />
    </ErrorBoundary>
  );
}
