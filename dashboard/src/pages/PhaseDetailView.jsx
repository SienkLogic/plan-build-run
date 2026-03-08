import { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, Badge, ErrorBoundary, QualityGateBadge, CheckpointBox } from '../components/ui/index.js';
import TabBar from '../components/ui/TabBar.jsx';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';

const TABS = ['plans', 'summaries', 'verifications', 'context'];

function statusColor(status, tokens) {
  const s = (status || '').toLowerCase();
  if (s === 'complete' || s === 'done' || s === 'passed') return tokens.success;
  if (s === 'partial' || s === 'in-progress') return tokens.plan;
  if (s === 'failed' || s === 'checkpoint') return tokens.error;
  return tokens.textDim;
}

function PlanCard({ item, tokens }) {
  return (
    <Card style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: tokens.text, flex: 1 }}>
            {item.file}
          </span>
          {item.plan && (
            <Badge color={tokens.accent}>Plan {item.plan}</Badge>
          )}
          {item.status && (
            <Badge color={statusColor(item.status, tokens)}>{item.status}</Badge>
          )}
        </div>
        {item.type && (
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: tokens.textDim }}>
            Type: {item.type}
          </span>
        )}
        {item.tasks_total != null && (
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: tokens.textMuted }}>
            Tasks: {item.tasks_total}
          </span>
        )}
      </div>
    </Card>
  );
}

function SummaryCard({ item, tokens }) {
  return (
    <Card style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: tokens.text, flex: 1 }}>
            {item.file}
          </span>
          {item.status && (
            <Badge color={statusColor(item.status, tokens)}>{item.status}</Badge>
          )}
        </div>
        {(item.tasks_completed != null || item.tasks_total != null) && (
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: tokens.textMuted }}>
            Completed: {item.tasks_completed ?? '?'}/{item.tasks_total ?? '?'}
          </span>
        )}
      </div>
    </Card>
  );
}

function VerificationCard({ item, tokens }) {
  return (
    <Card style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: tokens.text, flex: 1 }}>
            {item.file}
          </span>
          {item.status && (
            <Badge color={statusColor(item.status, tokens)}>{item.status}</Badge>
          )}
          {item.status && <QualityGateBadge passed={item.status === 'passed' || item.status === 'complete'} />}
        </div>
        {(item.must_haves_passed != null || item.must_haves_total != null) && (
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: tokens.textMuted }}>
            Must-haves: {item.must_haves_passed ?? '?'}/{item.must_haves_total ?? '?'}
          </span>
        )}
      </div>
    </Card>
  );
}

function ContextCard({ item, tokens }) {
  return (
    <Card style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: tokens.text }}>
          {item.file}
        </span>
        {item.body && (
          <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: tokens.textMuted, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
            {item.body.slice(0, 200)}
          </span>
        )}
      </div>
    </Card>
  );
}

const TAB_RENDERERS = {
  plans: PlanCard,
  summaries: SummaryCard,
  verifications: VerificationCard,
  context: ContextCard,
};

function PhaseDetailContent({ phaseSlug, phaseName, onBack }) {
  const { tokens } = useTheme();
  const [activeTab, setActiveTab] = useState('plans');
  const { data, loading, error, refetch } = useFetch(`/api/roadmap/phases/${phaseSlug}`);
  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { events: wsEvents } = useWebSocket(wsUrl);

  useEffect(() => {
    if (wsEvents.length > 0) refetch();
  }, [wsEvents.length, refetch]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonCard height={40} />
        <SkeletonCard height={30} />
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} height={70} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            onClick={onBack}
            style={{ cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 14, color: tokens.accent }}
          >
            &larr; Back
          </span>
          <span style={{ fontFamily: FONTS.sans, fontSize: 16, fontWeight: 700, color: tokens.text }}>
            {phaseName || phaseSlug}
          </span>
        </div>
        <Card style={{ border: `1px solid ${tokens.error}`, color: tokens.error }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 12 }}>Error loading phase: {error.message}</div>
        </Card>
      </div>
    );
  }

  const items = (data && data[activeTab]) || [];
  const Renderer = TAB_RENDERERS[activeTab];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header with back navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          onClick={onBack}
          style={{ cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 14, color: tokens.accent }}
        >
          &larr; Back
        </span>
        <span style={{ fontFamily: FONTS.sans, fontSize: 16, fontWeight: 700, color: tokens.text }}>
          {phaseName || phaseSlug}
        </span>
      </div>

      {/* Tab bar */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Phase verification checkpoint summary */}
      {activeTab === 'verifications' && items.length > 0 && (
        <CheckpointBox
          title="Phase Verification"
          status={items.every(i => i.status === 'passed' || i.status === 'complete') ? 'passed' : items.some(i => i.status === 'failed') ? 'failed' : 'pending'}
          items={items.map(i => ({ label: i.file, checked: i.status === 'passed' || i.status === 'complete' }))}
          readOnly={true}
        />
      )}

      {/* Tab content */}
      {items.length === 0 ? (
        <Card>
          <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: tokens.textMuted, textAlign: 'center', padding: 20 }}>
            No {activeTab} found
          </div>
        </Card>
      ) : (
        items.map((item, idx) => (
          <Renderer key={item.file || idx} item={item} tokens={tokens} />
        ))
      )}
    </div>
  );
}

export default function PhaseDetailView({ phaseSlug, phaseName, onBack }) {
  return (
    <ErrorBoundary>
      <PhaseDetailContent phaseSlug={phaseSlug} phaseName={phaseName} onBack={onBack} />
    </ErrorBoundary>
  );
}
