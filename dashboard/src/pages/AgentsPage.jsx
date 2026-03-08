import { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import {
  Card,
  Badge,
  CodeBlock,
  SectionTitle,
  BackButton,
  KeyValue,
  TabBar,
  MetricCard,
  ErrorBoundary,
} from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useToast from '../hooks/useToast.jsx';

const TYPE_ICONS = { agent: '\uD83E\uDD16', skill: '\u2699\uFE0F', command: '\u25B6\uFE0F' };

function formatDuration(ms) {
  if (!ms || ms < 0) return '--';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function formatTokens(input, output) {
  const total = (input || 0) + (output || 0);
  if (total === 0) return null;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tokens`;
  return `${total} tokens`;
}

function AgentsContent() {
  const { tokens } = useTheme();
  const { addToast } = useToast();
  const { data, loading, error } = useFetch('/api/agents');
  const [selected, setSelected] = useState(null);
  const [ctxTab, setCtxTab] = useState('default');
  const [agentStatus, setAgentStatus] = useState({});

  // WebSocket for real-time agent status
  const wsUrl = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : null;
  const { events } = useWebSocket(wsUrl);

  useEffect(() => {
    if (error) addToast('error', error.message);
  }, [error, addToast]);

  // Process WebSocket events for agent status
  useEffect(() => {
    if (!events.length) return;
    const latest = events[0];
    if (!latest || !latest.type) return;

    if (latest.type === 'SubagentStart') {
      setAgentStatus((prev) => ({ // eslint-disable-line react-hooks/set-state-in-effect
        ...prev,
        [latest.agentId || latest.name]: {
          status: 'running',
          startedAt: Date.now(),
          tokenUsage: { input: 0, output: 0 },
          duration: 0,
        },
      }));
    } else if (latest.type === 'SubagentStop') {
      setAgentStatus((prev) => ({
        ...prev,
        [latest.agentId || latest.name]: {
          status: 'idle',
          startedAt: prev[latest.agentId || latest.name]?.startedAt || null,
          tokenUsage: {
            input: latest.inputTokens || 0,
            output: latest.outputTokens || 0,
          },
          duration: latest.duration || 0,
        },
      }));
    }
  }, [events]);

  const typeColors = {
    agent: tokens.accent,
    skill: tokens.plan,
    command: tokens.success,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} height={90} />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} height={80} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ border: `1px solid ${tokens.error}`, color: tokens.error }}>
        <SectionTitle>Error loading agents</SectionTitle>
        <div style={{ fontFamily: FONTS.mono, fontSize: 12 }}>{error.message}</div>
      </Card>
    );
  }

  const agents = data || [];

  const typeCounts = agents.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  if (!selected) {
    return (
      <div>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {['agent', 'skill', 'command'].map((type) => (
            <MetricCard
              key={type}
              label={type}
              value={
                <span style={{ color: typeColors[type] }}>
                  {typeCounts[type] || 0}
                </span>
              }
              sub={
                <span style={{ fontFamily: FONTS.mono, textTransform: 'uppercase' }}>
                  {TYPE_ICONS[type]} {type}s
                </span>
              }
              color={typeColors[type]}
            />
          ))}
        </div>

        {/* Agent grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {agents.map((agent) => {
            const tc = typeColors[agent.type];
            const status = agentStatus[agent.id] || agentStatus[agent.name];
            const isRunning = status?.status === 'running';
            const tokenDisplay = status ? formatTokens(status.tokenUsage?.input, status.tokenUsage?.output) : null;
            const durationDisplay = status?.duration ? formatDuration(status.duration) : null;

            return (
              <Card
                key={agent.id}
                onClick={() => setSelected(agent.id)}
                style={{
                  borderLeft: `3px solid ${tc}`,
                  borderRadius: '4px 10px 10px 4px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Badge color={tc}>{agent.type}</Badge>
                  <span style={{ fontSize: 13, fontWeight: 700, color: tokens.text, fontFamily: FONTS.sans }}>
                    {agent.name}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: tokens.textMuted, fontFamily: FONTS.sans, marginBottom: 8 }}>
                  {agent.role}
                </div>

                {/* Status row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: isRunning ? tokens.success : tokens.textMuted,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11, fontFamily: FONTS.mono, color: isRunning ? tokens.success : tokens.textMuted }}>
                    {isRunning ? 'Running' : 'Idle'}
                  </span>
                  {tokenDisplay && (
                    <Badge color={tokens.accent}>{tokenDisplay}</Badge>
                  )}
                  {durationDisplay && (
                    <Badge color={tokens.textMuted}>{durationDisplay}</Badge>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Badge color={tokens.accent}>{(agent.contextSlots || []).length} context slots</Badge>
                  <Badge color={tokens.textMuted}>{agent.totalContextBudget || '--'}</Badge>
                  {(agent.hooks || []).length > 0 && (
                    <Badge color={tokens.info}>{agent.hooks.length} hooks</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Detail view
  const agent = agents.find((a) => a.id === selected);
  if (!agent) return null;
  const tc = typeColors[agent.type];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackButton onClick={() => { setSelected(null); setCtxTab('default'); }} />

      {/* Header card */}
      <Card style={{ borderTop: `3px solid ${tc}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Badge color={tc}>{agent.type}</Badge>
          <span style={{ fontSize: 18, fontWeight: 700, color: tokens.text, fontFamily: FONTS.sans }}>
            {agent.name}
          </span>
        </div>
        <div style={{ fontSize: 12, color: tokens.textMuted, fontFamily: FONTS.sans, marginBottom: 12 }}>
          {agent.role}
        </div>

        {agent.systemPrompt && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10,
              fontFamily: FONTS.mono,
              textTransform: 'uppercase',
              color: tokens.textMuted,
              marginBottom: 4,
            }}>
              SYSTEM PROMPT
            </div>
            <CodeBlock>{agent.systemPrompt}</CodeBlock>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <KeyValue label="Context Budget" value={agent.totalContextBudget} />
          <KeyValue label="Max Allowed" value={agent.maxAllowed} />
        </div>
      </Card>

      {/* Context Slots card */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <SectionTitle>Context Slots</SectionTitle>
          <TabBar tabs={['default', 'active']} active={ctxTab} onChange={setCtxTab} />
        </div>

        {ctxTab === 'default' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(agent.contextSlots || []).map((slot, i) => (
              <div
                key={i}
                style={{
                  background: tokens.surfaceAlt,
                  borderRadius: 6,
                  padding: '8px 10px',
                  borderLeft: `4px solid ${tokens.accent}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: tokens.text, fontFamily: FONTS.sans }}>
                    {slot.slot}
                  </span>
                  <Badge color={tokens.accent}>{(slot.tokens || 0).toLocaleString()} tokens</Badge>
                </div>
                <div style={{
                  fontSize: 10,
                  fontFamily: FONTS.mono,
                  color: tokens.textMuted,
                  marginBottom: 2,
                }}>
                  {slot.source}
                </div>
                <div style={{ fontSize: 11, color: tokens.textMuted, fontFamily: FONTS.sans }}>
                  {slot.description}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: tokens.textMuted, fontFamily: FONTS.sans, padding: 16, textAlign: 'center' }}>
            No active context data available. Run a session to populate.
          </div>
        )}
      </Card>

      {/* Lifecycle Hooks card */}
      {(agent.hooks || []).length > 0 && (
        <Card>
          <SectionTitle>Lifecycle Hooks</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(agent.hooks || []).map((hook) => (
              <Badge key={hook} color={tokens.info}>{hook}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Config Dependencies card */}
      {(agent.configKeys || []).length > 0 && (
        <Card>
          <SectionTitle>Config Dependencies</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(agent.configKeys || []).map((key) => (
              <Badge key={key} color={tokens.plan}>{key}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <ErrorBoundary>
      <AgentsContent />
    </ErrorBoundary>
  );
}
