import { useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

function SessionsPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();

  const { data, loading, error, refetch } = useFetch('/api/sessions');

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
          <SkeletonCard height={90} />
        </div>
        <SkeletonCard height={300} />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox
        title="Error loading sessions"
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  const sessions = Array.isArray(data) ? data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Sessions</SectionTitle>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <MetricCard label="Sessions" value={String(sessions.length)} sub="snapshots" color={t.accent} />
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}>&#x25C8;</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No session snapshots found</div>
            <div style={{ fontSize: 11 }}>Session snapshots appear when .planning/sessions/ contains files.</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map((session, i) => (
            <Card key={session.id || session.file || i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.accent }}>
                  {session.id || session.file || `Session ${i + 1}`}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  {session.status && <Badge color={t.build}>{session.status}</Badge>}
                  {session.duration && <Badge color={t.plan}>{session.duration}</Badge>}
                </div>
              </div>
              {session.date && (
                <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.textMuted, marginBottom: 6 }}>
                  {new Date(session.date).toLocaleString()}
                </div>
              )}
              {session.body && (
                <div style={{
                  fontFamily: FONTS.sans,
                  fontSize: 12,
                  color: t.textMuted,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  maxHeight: 60,
                }}>
                  {session.body.length > 200 ? session.body.slice(0, 200) + '...' : session.body}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionsPage() {
  return (
    <ErrorBoundary>
      <SessionsPageContent />
    </ErrorBoundary>
  );
}
