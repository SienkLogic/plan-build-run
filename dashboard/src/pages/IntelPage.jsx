import { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, TabBar, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

const TABS = ['Architecture', 'Dependencies', 'APIs', 'Files'];

function IntelPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('Architecture');

  const { data, loading, error, refetch } = useFetch('/api/intel');

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
        title="Error loading intel"
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  const intel = data && data.data ? data.data : {};
  const files = data && data.files ? data.files : [];
  const docs = Array.isArray(intel.docs) ? intel.docs : [];
  const deps = Array.isArray(intel.deps) ? intel.deps : [];
  const apis = Array.isArray(intel.apis) ? intel.apis : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Intel</SectionTitle>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <MetricCard label="Architecture" value={String(docs.length)} sub="documents" color={t.accent} />
        <MetricCard label="Dependencies" value={String(deps.length)} sub="packages" color={t.build} />
        <MetricCard label="APIs" value={String(apis.length)} sub="endpoints" color={t.plan} />
        <MetricCard label="Files" value={String(files.length)} sub="tracked" color={t.info || t.accent} />
      </div>

      {/* Tab bar */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Architecture tab */}
      {activeTab === 'Architecture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {docs.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                No architecture documents found
              </div>
            </Card>
          ) : (
            docs.map((doc, i) => (
              <Card key={doc.title || i}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.accent, marginBottom: 6 }}>
                  {doc.title || 'Untitled'}
                </div>
                {doc.body && (
                  <div style={{ fontFamily: FONTS.sans, fontSize: 12, color: t.textMuted, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 80 }}>
                    {doc.body.length > 300 ? doc.body.slice(0, 300) + '...' : doc.body}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Dependencies tab */}
      {activeTab === 'Dependencies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {deps.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                No dependencies found
              </div>
            </Card>
          ) : (
            deps.map((dep, i) => (
              <Card key={dep.name || i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.build }}>
                    {dep.name || 'unknown'}
                  </div>
                  {dep.version && <Badge color={t.accent}>{dep.version}</Badge>}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* APIs tab */}
      {activeTab === 'APIs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {apis.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                No API definitions found
              </div>
            </Card>
          ) : (
            apis.map((api, i) => (
              <Card key={api.name || api.path || i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.plan }}>
                    {api.method && <span style={{ marginRight: 8 }}>{api.method}</span>}
                    {api.path || api.name || 'unknown'}
                  </div>
                  {api.type && <Badge color={t.textMuted}>{api.type}</Badge>}
                </div>
                {api.description && (
                  <div style={{ fontFamily: FONTS.sans, fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                    {api.description}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Files tab */}
      {activeTab === 'Files' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {files.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                No intel files found
              </div>
            </Card>
          ) : (
            files.map((file, i) => (
              <Card key={typeof file === 'string' ? file : (file.path || i)}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: t.accent }}>
                  {typeof file === 'string' ? file : (file.path || file.name || 'unknown')}
                </div>
                {file.description && (
                  <div style={{ fontFamily: FONTS.sans, fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                    {file.description}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function IntelPage() {
  return (
    <ErrorBoundary>
      <IntelPageContent />
    </ErrorBoundary>
  );
}
