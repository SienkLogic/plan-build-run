import { useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

function MemoryPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();

  const { data, loading, error, refetch } = useFetch('/api/memory');

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
        <SkeletonCard height={90} />
        <SkeletonCard height={300} />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox
        title="Error loading memory"
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  const entries = Array.isArray(data) ? data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Memory</SectionTitle>

      {/* Metric card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <MetricCard label="Entries" value={String(entries.length)} sub="memory files" color={t.accent} />
      </div>

      {/* Memory entries */}
      {entries.length === 0 ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}>&#x25C8;</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No memory entries</div>
            <div style={{ fontSize: 11 }}>Memory entries appear when .planning/memory/ contains .md files.</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((entry, i) => (
            <Card key={entry.file || i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.accent }}>
                  {entry.title}
                </div>
                <Badge color={t.build}>{entry.type}</Badge>
              </div>
              {entry.content && (
                <div style={{
                  fontFamily: FONTS.sans,
                  fontSize: 12,
                  color: t.textMuted,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  maxHeight: 80,
                }}>
                  {entry.content.length > 300 ? entry.content.slice(0, 300) + '...' : entry.content}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MemoryPage() {
  return (
    <ErrorBoundary>
      <MemoryPageContent />
    </ErrorBoundary>
  );
}
